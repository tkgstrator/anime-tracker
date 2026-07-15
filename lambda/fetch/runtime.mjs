// Bun 実装の AWS Lambda custom runtime。従来 lambda/layers/bun-runtime.zip 内にあったものを
// そのまま container image (/var/runtime/runtime.mjs) に取り込んだ。
//
// _HANDLER = "index.handler" → ファイル: index.mjs, エクスポート: handler
const [modName, funcName] = process.env._HANDLER.split(".");
const HANDLER_PATH = `${process.env.LAMBDA_TASK_ROOT}/${modName}.mjs`;
const API = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime`;

const mod = await import(HANDLER_PATH);
const handler = mod[funcName] || mod.default;

while (true) {
  const next = await fetch(`${API}/invocation/next`);
  const requestId = next.headers.get("lambda-runtime-aws-request-id");
  const event = await next.json();

  try {
    const result = await handler(event);
    await fetch(`${API}/invocation/${requestId}/response`, {
      method: "POST",
      body: JSON.stringify(result),
    });
  } catch (err) {
    await fetch(`${API}/invocation/${requestId}/error`, {
      method: "POST",
      body: JSON.stringify({
        errorType: err.constructor.name,
        errorMessage: err.message,
        stack: err.stack?.split("\n"),
      }),
    });
  }
}
