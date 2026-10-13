variable "aws_region" {
  description = "Region for all resources. Must match the EC2 instance's region (ap-southeast-2)."
  type        = string
  default     = "ap-southeast-2"
}

variable "aws_profile" {
  description = "Optional named AWS CLI profile. Leave null to use AWS_PROFILE / the default chain."
  type        = string
  default     = null
}

variable "allowed_account_ids" {
  description = "Safety net: Terraform refuses to touch any other AWS account."
  type        = list(string)
}

variable "project_name" {
  description = "Short lowercase identifier used in resource names."
  type        = string
  default     = "hvac"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "Use 2-21 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Environment name used in resource names and tags."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,9}$", var.environment))
    error_message = "Use 2-10 lowercase letters or digits."
  }
}

variable "media_bucket_name_override" {
  description = "Optional explicit bucket name. Leave null to derive one from project, account and region."
  type        = string
  default     = null
}

variable "cors_allowed_origins" {
  description = <<-EOT
    Browser origins allowed to upload directly to the bucket with presigned POSTs,
    e.g. ["https://app.example.com", "https://admin.example.com"]. Must be the
    exact origins the customer and admin apps are served from.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.cors_allowed_origins) > 0 && alltrue([for o in var.cors_allowed_origins : can(regex("^https?://[^/*]+$", o))])
    error_message = "List one or more origins like https://app.example.com (no paths, no wildcards)."
  }
}

variable "noncurrent_version_retention_days" {
  description = "Days to keep overwritten/deleted object versions before they expire."
  type        = number
  default     = 90
}

variable "activity_table_point_in_time_recovery" {
  description = "Enable DynamoDB point-in-time recovery for the activity table."
  type        = bool
  default     = true
}

variable "ec2_role_name" {
  description = "Name of the IAM role (and instance profile) for the backend EC2 instance."
  type        = string
  default     = null
}

variable "extra_tags" {
  description = "Additional tags for every resource."
  type        = map(string)
  default     = {}
}
