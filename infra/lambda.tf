# Lambda 実行用 IAM Role
resource "aws_iam_role" "lambda_exec" {
  name = "anime-tracker-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda 関数（デプロイ前に bun run lambda/fetch/build.ts を実行すること）
resource "aws_lambda_function" "fetch" {
  function_name = "anime-tracker-fetch"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  # ESM バンドル (.mjs) を使用
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 60

  filename         = "${path.module}/../lambda/fetch/dist/function.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambda/fetch/index.ts")
}

# Function URL（AWS_IAM 認証 — 不正リクエストは Lambda 到達前にブロック）
resource "aws_lambda_function_url" "fetch" {
  function_name      = aws_lambda_function.fetch.function_name
  authorization_type = "AWS_IAM"
}

# LambdaInvoker が Function URL を呼び出せるようにするリソースベースポリシー
resource "aws_lambda_permission" "function_url_invoker" {
  statement_id           = "AllowLambdaInvokerFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.fetch.function_name
  principal              = aws_iam_user.lambda_invoker.arn
  function_url_auth_type = "AWS_IAM"
}

# Lambda 呼び出し専用 IAM User（Workers からの SigV4 署名用）
resource "aws_iam_user" "lambda_invoker" {
  name = "LambdaInvoker"
}

resource "aws_iam_user_policy" "lambda_invoker" {
  name = "invoke-function-url"
  user = aws_iam_user.lambda_invoker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunctionUrl",
          "lambda:InvokeFunction"
        ]
        Resource = aws_lambda_function.fetch.arn
      }
    ]
  })
}

resource "aws_iam_access_key" "lambda_invoker" {
  user = aws_iam_user.lambda_invoker.name
}

output "lambda_function_url" {
  value = aws_lambda_function_url.fetch.function_url
}

output "lambda_invoker_access_key_id" {
  value = aws_iam_access_key.lambda_invoker.id
}

output "lambda_invoker_secret_access_key" {
  value     = aws_iam_access_key.lambda_invoker.secret
  sensitive = true
}
