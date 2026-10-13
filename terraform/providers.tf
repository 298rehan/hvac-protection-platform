# Credentials are never configured here. Terraform uses the standard AWS
# credential chain - locally that means `AWS_PROFILE=hvac-dev` (or
# `aws_profile = "hvac-dev"` in terraform.tfvars).
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Refuse to run against any account other than the intended one.
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = local.tags
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  name_prefix = "${var.project_name}-${var.environment}"

  # S3 bucket names are global: account id + region make this one unique
  # without random suffixes that would change on every fresh state.
  media_bucket_name = coalesce(
    var.media_bucket_name_override,
    "${local.name_prefix}-media-${local.account_id}-${var.aws_region}"
  )

  # Object-key prefixes the backend writes to. IAM is scoped to exactly these.
  app_key_prefixes = ["customers/", "service-requests/"]

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "github.com/298rehan/hvac-protection-platform"
    },
    var.extra_tags,
  )
}
