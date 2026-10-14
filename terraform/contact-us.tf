# Contact Us: customer form -> API Gateway -> Lambda -> DynamoDB + SES email

# Contact Us messages table
resource "aws_dynamodb_table" "contact_messages" {
  name         = "${local.name_prefix}-contact-messages"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "message_id"

  attribute {
    name = "message_id"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name    = "${local.name_prefix}-contact-messages"
    Purpose = "Customer Contact Messages"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Lambda execution role
resource "aws_iam_role" "contact_lambda" {
  name = "${local.name_prefix}-contact-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# Permissions required by the Contact Us Lambda (least privilege)
resource "aws_iam_role_policy" "contact_lambda" {
  name = "${local.name_prefix}-contact-lambda-policy"
  role = aws_iam_role.contact_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = aws_dynamodb_table.contact_messages.arn
      },
      {
        # Only the one verified address may be used to send.
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = aws_sesv2_email_identity.contact.arn
      },
      {
        # Terraform creates the log group; the function only writes to it.
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.contact_lambda.arn}:*"
      }
    ]
  })
}

# SES: the notification address. Creating it makes AWS email a verification
# link to this address - it can't send until that link is clicked.
resource "aws_sesv2_email_identity" "contact" {
  email_identity = var.contact_notification_email
}

# Lambda logs (kept 14 days)
resource "aws_cloudwatch_log_group" "contact_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-contact"
  retention_in_days = 14
}

# Zip the source; source_code_hash below redeploys the function whenever it changes.
data "archive_file" "contact_lambda" {
  type        = "zip"
  source_file = "${path.module}/../lambda/contact/app.py"
  output_path = "${path.module}/.build/contact-lambda.zip"
}

resource "aws_lambda_function" "contact" {
  function_name    = "${local.name_prefix}-contact"
  role             = aws_iam_role.contact_lambda.arn
  runtime          = "python3.12"
  handler          = "app.handler"
  filename         = data.archive_file.contact_lambda.output_path
  source_code_hash = data.archive_file.contact_lambda.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      TABLE_NAME      = aws_dynamodb_table.contact_messages.name
      SENDER_EMAIL    = aws_sesv2_email_identity.contact.email_identity
      RECIPIENT_EMAIL = var.contact_notification_email
    }
  }

  depends_on = [aws_cloudwatch_log_group.contact_lambda, aws_iam_role_policy.contact_lambda]
}

# HTTP API with CORS limited to the customer site
resource "aws_apigatewayv2_api" "contact" {
  name          = "${local.name_prefix}-contact-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.contact_allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "contact" {
  api_id                 = aws_apigatewayv2_api.contact.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.contact.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "contact" {
  api_id    = aws_apigatewayv2_api.contact.id
  route_key = "POST /contact"
  target    = "integrations/${aws_apigatewayv2_integration.contact.id}"
}

# Default stage, deployed automatically. Throttling limits spam and cost.
resource "aws_apigatewayv2_stage" "contact" {
  api_id      = aws_apigatewayv2_api.contact.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

# Allow API Gateway (only this API's POST /contact route) to call the function.
resource "aws_lambda_permission" "contact_api" {
  statement_id  = "AllowContactApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.contact.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.contact.execution_arn}/*/POST/contact"
}
