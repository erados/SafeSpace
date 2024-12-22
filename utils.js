// 브라우저 언어에 따라 적절한 메시지 반환
function getLocalizedMessage(messageKey) {
  return chrome.i18n.getMessage(messageKey) || messageKey;
}