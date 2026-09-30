function unwrapMessageContent(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessageContent(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapMessageContent(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessageContent(message.viewOnceMessageV2.message);
  return message;
}

function inspectIncomingMessage(message) {
  const content = unwrapMessageContent(message?.message);
  return {
    content,
    isEmptyProtocolStub: !content && message?.messageStubType !== undefined
  };
}

module.exports = { inspectIncomingMessage };
