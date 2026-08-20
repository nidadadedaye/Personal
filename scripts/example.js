/**
 * 示例脚本：供 modules/example.sgmodule 的 [Script] 段引用
 * 类型：http-response
 */
function main() {
  const body = $response.body;
  $done({ body });
}

main();
