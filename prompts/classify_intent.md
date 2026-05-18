請判斷使用者訊息意圖，回傳 JSON。

可用 intent：
- chat
- learn_material
- update_persona
- generate_script
- rewrite_script
- delete_memory
- delete_document
- ask_clarifying_question

輸出格式：
{
  "intent": "chat",
  "confidence": 0.8,
  "shouldGenerateScript": false,
  "reason": "..."
}
