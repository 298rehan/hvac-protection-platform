# Private bucket for customer / technician photos and documents.
# Objects are only ever reached through short-lived presigned URLs issued by the
# backend after it has authorised the user.

resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name

  # Never let Terraform delete a bucket holding customer photos.
  force_destroy = false

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

# ACLs disabled: the bucket owner owns every object, access is policy-only.
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

# SSE-S3 (AES-256). No KMS key to manage and no per-request KMS charges; switch
# to aws:kms with a customer-managed key if key-level audit is ever required.
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  # Versioning must be on before noncurrent-version rules apply.
  depends_on = [aws_s3_bucket_versioning.media]

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}

    # Deleted/replaced photos (rejected uploads, removed photos) are kept as
    # noncurrent versions for recovery, then expire.
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Browsers upload directly to S3 with presigned POSTs, so the app origins need
# CORS for POST. Viewing uses plain <img> tags with presigned GET URLs, which
# needs no CORS.
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

data "aws_iam_policy_document" "media_bucket" {
  # Reject any request that is not over TLS.
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
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_bucket.json

  # The public access block must exist first so this policy can never be
  # evaluated as public.
  depends_on = [aws_s3_bucket_public_access_block.media]
}
