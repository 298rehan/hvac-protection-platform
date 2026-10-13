terraform {
  # 1.10+ is required for S3-native state locking (`use_lockfile`).
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  # Remote state in a dedicated, private, versioned S3 bucket with S3-native
  # locking. Settings are supplied at init time so no account details live in
  # source control:
  #
  #   terraform init -backend-config=backend.hcl
  #
  # See backend.hcl.example and README.md (the state bucket is created once by
  # ./bootstrap).
  backend "s3" {}
}
