# Role assumed by the existing backend EC2 instance through an instance profile.
# The containers obtain short-lived credentials from IMDSv2 (the instance already
# has HttpTokens=required and a hop limit of 2, which Docker needs).
#
# Terraform does NOT manage the EC2 instance itself. The profile is attached
# with a one-off `aws ec2 associate-iam-instance-profile` command (see
# README.md), which needs no reboot and cannot replace the instance.

locals {
  ec2_role_name = coalesce(var.ec2_role_name, "${local.name_prefix}-backend-ec2")
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name                 = local.ec2_role_name
  description          = "HVAC backend on EC2: photo objects in S3 and activity events in DynamoDB."
  assume_role_policy   = data.aws_iam_policy_document.ec2_assume_role.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "backend" {
  # Read/write/delete photo objects - only under the app's own prefixes.
  # (Presigned URLs are signed with these credentials, so the browser can never
  # exceed them either.)
  statement {
    sid    = "PhotoObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
    ]
    resources = [for prefix in local.app_key_prefixes : "${aws_s3_bucket.media.arn}/${prefix}*"]
  }

  # Lets HeadObject return 404 (instead of 403) for a not-yet-uploaded photo.
  # Restricted to the same prefixes, so other keys cannot even be listed.
  statement {
    sid       = "ListAppPrefixes"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [for prefix in local.app_key_prefixes : "${prefix}*"]
    }
  }

  # Append and read activity events. No UpdateItem/DeleteItem/Scan: the history
  # is append-only from the application's point of view.
  statement {
    sid    = "ActivityEvents"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:Query",
    ]
    resources = [aws_dynamodb_table.activity.arn]
  }
}

resource "aws_iam_role_policy" "backend" {
  name   = "${local.name_prefix}-backend-app-access"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.backend.json
}

resource "aws_iam_instance_profile" "backend" {
  name = local.ec2_role_name
  role = aws_iam_role.backend.name
}
