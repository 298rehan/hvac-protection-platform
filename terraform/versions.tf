terraform {
  # 1.10+ is required for S3-native state locking (`use_lockfile`).
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    # Zips the Contact Us Lambda source (lambda/contact) at plan time.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Remote state in the dedicated, private, versioned bucket created by
  # ./bootstrap. None of these values are secret. Credentials come from your
  # AWS CLI profile ($env:AWS_PROFILE = "hvac-dev"), never from this file.
  backend "s3" {
    bucket       = "hvac-tfstate-594775505885-ap-southeast-2"
    key          = "hvac/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true # S3-native state locking (Terraform >= 1.10)
  }
}