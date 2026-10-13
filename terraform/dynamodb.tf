# Append-only activity history for service requests.
#
# Key design:
#   request_id          (S, partition) - the MySQL service_requests.id as a string
#   event_timestamp_id  (S, sort)      - "<UTC ISO-8601 with microseconds>Z#<uuid4>"
#
# One Query on request_id with ScanIndexForward=true returns a request's events
# in chronological order. The fixed-width timestamp makes string order equal
# time order; the UUID suffix makes two events in the same microsecond distinct.
# The backend writes with attribute_not_exists(event_timestamp_id), so retries
# can never overwrite or duplicate an event.

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

  # Encryption at rest is always on. Omitting `server_side_encryption` uses an
  # AWS-owned key at no extra cost.

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}
