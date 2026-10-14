# HVAC Protection Platform - application infrastructure (ap-southeast-2).
# Provider, account guard and naming locals: providers.tf
# Inputs: variables.tf    Outputs: outputs.tf    State backend: versions.tf

# =============================================================================
# S3 - private bucket for customer and technician photos
# =============================================================================
# Objects are only reached through short-lived presigned URLs from the backend.

resource "aws_s3_bucket" "media" {
  bucket        = local.media_bucket_name
  force_destroy = false

  # Never let Terraform delete the bucket that holds customer photos.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs disabled: the bucket owner owns every object.
resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket     = aws_s3_bucket.media.id
  depends_on = [aws_s3_bucket_versioning.media]

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Old versions of deleted/replaced photos are kept for recovery, then expire.
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Browsers upload directly to S3 (presigned POST) from the app origins only.
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Reject any request that is not made over HTTPS.
data "aws_iam_policy_document" "media_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.media.arn,
      "${aws_s3_bucket.media.arn}/*",
    ]

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

resource "aws_s3_bucket_policy" "media" {
  bucket     = aws_s3_bucket.media.id
  policy     = data.aws_iam_policy_document.media_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.media]
}

# =============================================================================
# DynamoDB - service-request activity history (append-only)
# =============================================================================
# request_id         = partition key (the MySQL service request id)
# event_timestamp_id = sort key "<UTC timestamp>#<uuid>", so a query returns
#                      one request's events in time order.

resource "aws_dynamodb_table" "activity" {
  name         = "${local.name_prefix}-service-activity"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "request_id"
  range_key    = "event_timestamp_id"

  attribute {
    name = "request_id"
    type = "S"
  }

  attribute {
    name = "event_timestamp_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.activity_table_point_in_time_recovery
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

# =============================================================================
# IAM - role and instance profile for the existing backend EC2 instance
# =============================================================================
# Terraform does not manage the EC2 instance itself; the instance profile is
# attached to it separately (see README.md).

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

# Least privilege: only the app's photo prefixes and the one activity table.
data "aws_iam_policy_document" "backend" {
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

  # Lets the backend get "404 Not Found" (not 403) for a photo not uploaded yet.
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

  # Append and read events only - no update, delete or scan.
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
