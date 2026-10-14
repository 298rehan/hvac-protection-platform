# Names and ARNs only - nothing here is secret.

output "aws_account_id" {
  description = "Account the resources were created in."
  value       = local.account_id
}

output "media_bucket_name" {
  description = "Value for the backend's S3_BUCKET_NAME."
  value       = aws_s3_bucket.media.bucket
}

output "media_bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "activity_table_name" {
  description = "Value for the backend's DYNAMODB_ACTIVITY_TABLE."
  value       = aws_dynamodb_table.activity.name
}

output "activity_table_arn" {
  value = aws_dynamodb_table.activity.arn
}

output "backend_role_arn" {
  value = aws_iam_role.backend.arn
}

output "backend_instance_profile_name" {
  description = "Attach to the existing EC2 instance with associate-iam-instance-profile."
  value       = aws_iam_instance_profile.backend.name
}

output "backend_env" {
  description = "Lines to add to the server's .env (no credentials needed on EC2)."
  value       = <<-EOT
    AWS_REGION=${var.aws_region}
    S3_BUCKET_NAME=${aws_s3_bucket.media.bucket}
    DYNAMODB_ACTIVITY_TABLE=${aws_dynamodb_table.activity.name}
  EOT
}

output "contact_api_url" {
  description = "POST endpoint for the Contact Us form (NEXT_PUBLIC_CONTACT_API_URL)."
  value       = "${aws_apigatewayv2_stage.contact.invoke_url}contact"
}

output "contact_lambda_function_name" {
  value = aws_lambda_function.contact.function_name
}

output "contact_messages_table_name" {
  value = aws_dynamodb_table.contact_messages.name
}
