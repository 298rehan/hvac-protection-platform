# Terraform: S3 photos, DynamoDB activity history, backend IAM role

Creates **only new resources** in `ap-southeast-2` (account `594775505885`):

| Resource | Name |
|---|---|
| Private media bucket | `hvac-prod-media-594775505885-ap-southeast-2` |
| Activity table | `hvac-prod-service-activity` |
| Backend role + instance profile | `hvac-prod-backend-ec2` |
| Inline policy | `hvac-prod-backend-app-access` |
| State bucket (bootstrap) | `hvac-tfstate-594775505885-ap-southeast-2` |

It does **not** manage the existing EC2 instance, its security group, or the
unrelated `plans-594775505885-ap-southeast-2-an` bucket. Nothing is imported.

## Security properties

* **S3:** all four Block Public Access settings on, ACLs disabled
  (BucketOwnerEnforced), versioning on, SSE-S3 default encryption, and a bucket
  policy that denies non-TLS requests. CORS allows only `POST` from
  `cors_allowed_origins`. Lifecycle aborts incomplete multipart uploads after
  1 day and expires noncurrent versions after `noncurrent_version_retention_days`.
* **DynamoDB:** on-demand billing, point-in-time recovery, deletion protection,
  encryption at rest with an AWS-owned key. Key schema:
  `request_id` (S, partition) + `event_timestamp_id` (S, sort,
  `2026-10-14T08:15:30.123456Z#<uuid4>`). Query by `request_id`, ascending.
* **IAM (application):**
  * `s3:PutObject`/`GetObject`/`DeleteObject` on `customers/*` and `service-requests/*` only.
  * `s3:ListBucket` limited by `s3:prefix` to the same two prefixes. This lets a check on a photo that hasn't been uploaded yet return 404 instead of 403.
  * `dynamodb:PutItem` and `Query` on the one table.

  Nothing else, and no managed `*FullAccess` policies.
* Bucket and table have `prevent_destroy`; `allowed_account_ids` stops the
  config from ever running against another account.
* No credentials appear in any `.tf`, `.tfvars` or output.

## Prerequisites

```bash
terraform version                 # 1.10+ (developed with 1.16.2)
aws sts get-caller-identity --profile hvac-dev
# Expect Account 594775505885. Stop if it is anything else.
export AWS_PROFILE=hvac-dev       # PowerShell: $env:AWS_PROFILE = "hvac-dev"
```

To create or fix the profile without ever pasting keys anywhere else:
`aws configure --profile hvac-dev` (enter keys at the interactive prompt; they
are stored in `~/.aws/credentials`, outside the repository). Region:
`ap-southeast-2`.

## 1. Bootstrap the state bucket (once)

```bash
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out=bootstrap.tfplan      # review: 7 to add, 0 to change, 0 to destroy
terraform apply bootstrap.tfplan
terraform output state_bucket_name
```

Keep `terraform/bootstrap/terraform.tfstate` safe (it holds no secrets). It is
git-ignored.

## 2. Configure and initialise the main stack

The backend settings (bucket from step 1, key `hvac/terraform.tfstate`, region
`ap-southeast-2`) are written directly in `versions.tf`, so no `backend.hcl`
is needed.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars  # set cors_allowed_origins!
terraform init
terraform fmt -check -recursive
terraform validate
```

`cors_allowed_origins` must list the exact origins (scheme, host and port) that
the customer and admin apps are opened from in the browser, e.g.
`http://54.206.86.229` and `http://54.206.86.229:3001`, or your domains.
Otherwise browser uploads are blocked by CORS. Changing it later is an
in-place update.

### State storage and locking

State lives in the private, versioned, encrypted, TLS-only bootstrap bucket.
`use_lockfile = true` uses **S3-native locking** (a `.tflock` object; Terraform
≥ 1.10). The older DynamoDB lock table is deprecated and not needed. Only
principals with access to that bucket can read state; state contains resource
names and ARNs but no secrets.

## 3. Plan, review, apply

```bash
terraform plan -out=tfplan
terraform show tfplan            # read every line
```

Expected on first run: **12 to add, 0 to change, 0 to destroy**. If a plan ever
shows `destroy` or `must be replaced`, stop and investigate. Never run
`terraform destroy`.

```bash
terraform apply tfplan           # applies exactly the reviewed plan
terraform output
```

Cost: S3 storage and requests, on-demand DynamoDB, and DynamoDB PITR are
usage-based and small at this scale; IAM is free.

## 4. Attach the role to the existing EC2 instance (no reboot, no replacement)

```bash
aws ec2 describe-instances --region ap-southeast-2 --instance-ids i-0fbca37ce8619e143 \
  --query "Reservations[].Instances[].IamInstanceProfile"      # expect null today

aws ec2 associate-iam-instance-profile --region ap-southeast-2 \
  --instance-id i-0fbca37ce8619e143 \
  --iam-instance-profile Name=hvac-prod-backend-ec2
```

> **Note:** the `hvac-dev` user's organisation SCP blocked `ec2:DescribeInstances`
> in eu-north-1 but allowed it in ap-southeast-2. If the associate call is denied,
> run it from the console instead: EC2 → instance → Actions → Security →
> Modify IAM role.

The instance already has IMDSv2 required with hop limit 2, so the backend
container can reach the role credentials. Verify from the server:

```bash
docker compose exec backend python -c "import boto3; print(boto3.client('sts').get_caller_identity()['Arn'])"
# expect ...:assumed-role/hvac-prod-backend-ec2/i-0fbca37ce8619e143
```

## 5. Configure the backend

Add the values from `terraform output backend_env` to the server's `.env`. No
access keys: the instance role supplies credentials.
