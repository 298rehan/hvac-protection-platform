# One-time bootstrap: the private, versioned S3 bucket that holds the main
# configuration's Terraform state (with S3-native locking, no DynamoDB table).
#
# This directory uses LOCAL state on purpose (it cannot store its state in the
# bucket it creates). Its state holds no secrets - only this bucket's settings.
# Keep terraform.tfstate from this folder somewhere safe, or re-import the
# bucket later with `terraform import aws_s3_bucket.state <name>`.

terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

variable "aws_profile" {
  type    = string
  default = null
}

variable "allowed_account_ids" {
  type = list(string)
}

variable "project_name" {
  type    = string
  default = "hvac"
}

provider "aws" {
  region              = var.aws_region
  profile             = var.aws_profile
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform-bootstrap"
      Purpose   = "terraform-state"
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket        = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versioning lets you recover an earlier state file after a bad apply.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket     = aws_s3_bucket.state.id
  depends_on = [aws_s3_bucket_versioning.state]

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 180
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "state" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket     = aws_s3_bucket.state.id
  policy     = data.aws_iam_policy_document.state.json
  depends_on = [aws_s3_bucket_public_access_block.state]
}

output "state_bucket_name" {
  description = "Use as `bucket` in ../backend.hcl."
  value       = aws_s3_bucket.state.bucket
}
