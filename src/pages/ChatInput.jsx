import {
  FiCamera,
  FiMic,
  FiMicOff,
  FiPaperclip,
  FiSend,
  FiSmile,
  FiVolume2
} from "react-icons/fi";
import { QUICK_EMOJIS, STICKER_PACKS, trimReplyPreview, useChat } from "./hooks/useChat";

export default function ChatInput() {
  const {
    showEmojiTray,
    pickerTab,
    setPickerTab,
    onEmojiPick,
    isFavoritePick,
    toggleFavoritePick,
    openStickerPicker,
    customStickers,
    onCustomStickerPick,
    removeCustomSticker,
    onStickerPick,
    favoriteItemsForTray,
    replyDraft,
    myUserId,
    setReplyDraft,
    toggleEmojiTray,
    composerInputRef,
    inputText,
    setInputText,
    sendMessage,
    openAttachPicker,
    openCameraPicker,
    hasDraft,
    isSpeechTyping,
    showSpeechTypingMic,
    toggleSpeechTyping,
    isRecordingAudio,
    toggleAudioRecording,
    attachInputRef,
    onFilePicked,
    cameraInputRef,
    stickerInputRef,
    onStickerImagePicked
  } = useChat();

  return (
    <>
      {showEmojiTray && (
        <div className="emoji-tray" aria-label="Emoji and sticker picker">
          <div className="emoji-tray-tabs" role="tablist" aria-label="Picker tabs">
            <button
              type="button"
              role="tab"
              aria-selected={pickerTab === "emoji"}
              className={`emoji-tab ${pickerTab === "emoji" ? "is-active" : ""}`}
              onClick={() => setPickerTab("emoji")}
            >
              Emojis
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pickerTab === "sticker"}
              className={`emoji-tab ${pickerTab === "sticker" ? "is-active" : ""}`}
              onClick={() => setPickerTab("sticker")}
            >
              Stickers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pickerTab === "favorite"}
              className={`emoji-tab ${pickerTab === "favorite" ? "is-active" : ""}`}
              onClick={() => setPickerTab("favorite")}
            >
              Favorites
            </button>
          </div>

          {pickerTab === "emoji" && (
            <div className="emoji-grid" role="listbox" aria-label="Emoji picker">
              {QUICK_EMOJIS.map((emoji) => (
                <div key={`emoji-${emoji}`} className="emoji-chip-wrap">
                  <button type="button" className="emoji-chip" onClick={() => onEmojiPick(emoji)}>
                    {emoji}
                  </button>
                  <button
                    type="button"
                    className={`emoji-fav-btn ${isFavoritePick("emoji", emoji) ? "is-active" : ""}`}
                    title="Add to favorites"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoritePick({ type: "emoji", value: emoji, label: emoji });
                    }}
                  >
                    ?
                  </button>
                </div>
              ))}
            </div>
          )}

          {pickerTab === "sticker" && (
            <div className="sticker-grid" role="listbox" aria-label="Sticker picker">
              <button type="button" className="sticker-create-btn" onClick={openStickerPicker}>
                + Create sticker from image
              </button>
              {customStickers.map((sticker) => (
                <div key={sticker.id} className="sticker-chip-wrap sticker-image-wrap">
                  <button type="button" className="sticker-image-chip" onClick={() => onCustomStickerPick(sticker)}>
                    <img src={sticker.dataUrl} alt={sticker.name || "Sticker"} />
                    <small>{sticker.name || "My sticker"}</small>
                  </button>
                  <button
                    type="button"
                    className={`emoji-fav-btn ${isFavoritePick("customSticker", sticker.id) ? "is-active" : ""}`}
                    title="Add to favorites"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoritePick({ type: "customSticker", value: sticker.id, label: sticker.name || "My sticker" });
                    }}
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    className="emoji-fav-btn"
                    title="Remove sticker"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomSticker(sticker.id);
                    }}
                  >
                    ?
                  </button>
                </div>
              ))}
              {STICKER_PACKS.map((sticker) => (
                <div key={sticker.id} className="sticker-chip-wrap">
                  <button type="button" className="sticker-chip" onClick={() => onStickerPick(sticker.value)}>
                    <span>{sticker.value}</span>
                    <small>{sticker.label}</small>
                  </button>
                  <button
                    type="button"
                    className={`emoji-fav-btn ${isFavoritePick("sticker", sticker.value) ? "is-active" : ""}`}
                    title="Add to favorites"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoritePick({ type: "sticker", value: sticker.value, label: sticker.label });
                    }}
                  >
                    ?
                  </button>
                </div>
              ))}
            </div>
          )}

          {pickerTab === "favorite" && (
            <div className="sticker-grid" role="listbox" aria-label="Favorite picks">
              {favoriteItemsForTray.length === 0 && (
                <p className="emoji-empty">No favorites yet. Tap ? to save emojis and stickers.</p>
              )}
              {favoriteItemsForTray.map((fav, idx) => (
                <div key={`${fav.type}-${fav.value}-${idx}`} className="sticker-chip-wrap">
                  <button
                    type="button"
                    className={fav.type === "sticker" ? "sticker-chip" : fav.type === "customSticker" ? "sticker-image-chip" : "emoji-chip"}
                    onClick={() => {
                      if (fav.type === "sticker") onStickerPick(fav.value);
                      else if (fav.type === "customSticker") onCustomStickerPick(fav.sticker);
                      else onEmojiPick(fav.value);
                    }}
                  >
                    {fav.type === "sticker" ? (
                      <>
                        <span>{fav.value}</span>
                        <small>{fav.label || "Sticker"}</small>
                      </>
                    ) : fav.type === "customSticker" ? (
                      <>
                        <img src={fav.sticker?.dataUrl} alt={fav.label || "Sticker"} />
                        <small>{fav.label || "My sticker"}</small>
                      </>
                    ) : (
                      fav.value
                    )}
                  </button>
                  <button
                    type="button"
                    className="emoji-fav-btn is-active"
                    title="Remove from favorites"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoritePick(fav);
                    }}
                  >
                    ?
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {replyDraft && (
        <div className="chat-reply-draft">
          <div className="chat-reply-draft-text">
            <strong>
              Replying to {String(replyDraft.senderId || "") === String(myUserId) ? "You" : (replyDraft.senderName || "User")}
            </strong>
            <span>{trimReplyPreview(replyDraft.preview || "Message")}</span>
          </div>
          <button type="button" className="chat-reply-draft-cancel" onClick={() => setReplyDraft(null)}>
            Cancel
          </button>
        </div>
      )}

      <div className="chat-input-row wa-input-row">
        <div className="composer-input-shell">
          <button type="button" className="input-icon composer-emoji-btn" title="Emoji" onClick={toggleEmojiTray}>
            <FiSmile />
          </button>
          <input
            className="composer-input"
            ref={composerInputRef}
            type="text"
            placeholder="Message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />
          <button type="button" className="input-icon composer-attach-btn" title="Attach" onClick={openAttachPicker}>
            <FiPaperclip />
          </button>
          <button type="button" className="input-icon composer-camera-btn" title="Camera" onClick={openCameraPicker}>
            <FiCamera />
          </button>
        </div>
        {hasDraft ? (
          <button
            type="button"
            className="chat-send-btn composer-send-btn"
            onClick={sendMessage}
            aria-label="Send message"
          >
            <FiSend />
          </button>
        ) : (
          <div className="composer-actions-stack">
            <button
              type="button"
              className={`mic-fab composer-voice-note-btn ${isRecordingAudio ? "active" : ""}`}
              title={isRecordingAudio ? "Stop and send voice note" : "Speaker: record voice note"}
              onClick={toggleAudioRecording}
            >
              {isRecordingAudio ? <FiMicOff /> : <FiVolume2 />}
            </button>
            {showSpeechTypingMic && (
              <button
                type="button"
                className={`mic-fab composer-speech-btn ${isSpeechTyping ? "active" : ""}`}
                title={isSpeechTyping ? "Stop speech typing" : "Mic: speak to type"}
                onClick={toggleSpeechTyping}
              >
                {isSpeechTyping ? <FiMicOff /> : <FiMic />}
              </button>
            )}
          </div>
        )}
        <input
          ref={attachInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
          className="chat-hidden-file-input"
          onChange={onFilePicked}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="chat-hidden-file-input"
          onChange={onFilePicked}
        />
        <input
          ref={stickerInputRef}
          type="file"
          accept="image/*"
          className="chat-hidden-file-input"
          onChange={onStickerImagePicked}
        />
      </div>
    </>
  );
}
