import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiChevronDown,
  FiChevronUp,
  FiChevronRight,
  FiEye,
  FiFileText,
  FiHeart,
  FiImage,
  FiMessageCircle,
  FiMic,
  FiMicOff,
  FiMonitor,
  FiMoreVertical,
  FiMusic,
  FiSend,
  FiSmile,
  FiUsers,
  FiUserPlus,
  FiVolume2,
  FiVolumeX,
  FiX,
  FiLink,
  FiPhone,
  FiPhoneOff,
  FiSearch,
  FiVideo,
  FiVideoOff
} from "react-icons/fi";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import {
  CHAT_WALLPAPER_PRESETS,
  decodeSignAssistText,
  extractFeedShare,
  extractReelShare,
  formatStoryCount,
  getStoryUserEmailValue,
  getStoryUserIdValue,
  trimReplyPreview,
  useChat
} from "./hooks/useChat";
import ChatHeader from "./ChatHeader";
import ChatInput from "./ChatInput";

const MEDIA_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" }
];

export default function ChatMessages() {
  const {
    navigate,
    location,
    isConversationRoute,
    isRequestsRoute,
    safeGetItem,
    safeSetItem,
    normalizeThreadReadState,
    readThreadReadState,
    readStoryCache,
    normalizeStoryList,
    writeStoryCache,
    isStoryFeedDisabled,
    disableStoryFeedTemporarily,
    readDiscoveryCache,
    writeDiscoveryCache,
    isChatApiDisabled,
    disableChatApiTemporarily,
    markThreadRead,
    bumpThreadUnread,
    syncThreadUnreadFromIncomingTimes,
    fetchStoryFeed,
    persistCallRejoin,
    clearCallRejoin,
    writeRefreshGrace,
    myUserId,
    setMyUserId,
    myEmail,
    setMyEmail,
    contacts,
    setContacts,
    contactsRef,
    contactActionId,
    setContactActionId,
    activeContactId,
    setActiveContactId,
    threadReadState,
    setThreadReadState,
    activeContactIdRef,
    isConversationRouteRef,
    threadReadStateRef,
    messagesByContact,
    setMessagesByContact,
    inputText,
    setInputText,
    query,
    setQuery,
    error,
    setError,
    newChatOpen,
    setNewChatOpen,
    showSidebarMenu,
    setShowSidebarMenu,
    newChatQuery,
    setNewChatQuery,
    searchingUsers,
    setSearchingUsers,
    searchUsers,
    setSearchUsers,
    sidebarSearchUsers,
    setSidebarSearchUsers,
    chatFallbackMode,
    setChatFallbackMode,
    pendingShareDraft,
    setPendingShareDraft,
    shareHint,
    setShareHint,
    reelPreviewById,
    feedPreviewById,
    setReelPreviewById,
    reelPosterBySrc,
    setReelPosterBySrc,
    incomingCall,
    setIncomingCall,
    callState,
    setCallState,
    groupCallActive,
    setGroupCallActive,
    groupRoomId,
    setGroupRoomId,
    groupMembers,
    setGroupMembers,
    groupRemoteTiles,
    setGroupRemoteTiles,
    groupInviteOpen,
    setGroupInviteOpen,
    groupInviteIds,
    setGroupInviteIds,
    callError,
    setCallError,
    isMuted,
    setIsMuted,
    isCameraOff,
    setIsCameraOff,
    isSpeakerOn,
    setIsSpeakerOn,
    ringtoneMuted,
    setRingtoneMuted,
    callDurationSec,
    setCallDurationSec,
    callHistoryByContact,
    setCallHistoryByContact,
    videoFilterId,
    setVideoFilterId,
    showVideoFilters,
    setShowVideoFilters,
    isScreenSharing,
    setIsScreenSharing,
    remoteIsScreenShare,
    setRemoteIsScreenShare,
    localVideoPos,
    setLocalVideoPos,
    incomingCallPopupPos,
    setIncomingCallPopupPos,
    activeCallPopupPos,
    setActiveCallPopupPos,
    bubbleMenu,
    setBubbleMenu,
    showEmojiTray,
    setShowEmojiTray,
    imagePreview,
    setImagePreview,
    pickerTab,
    setPickerTab,
    favoritePicks,
    setFavoritePicks,
    customStickers,
    setCustomStickers,
    isRecordingAudio,
    setIsRecordingAudio,
    isSpeechTyping,
    setIsSpeechTyping,
    speechLang,
    setSpeechLang,
    speechLangOptions,
    setSpeechLangOptions,
    showHeaderMenu,
    setShowHeaderMenu,
    showCallMenu,
    setShowCallMenu,
    showWallpaperPanel,
    setShowWallpaperPanel,
    activeUtilityPanel,
    setActiveUtilityPanel,
    chatSearchQuery,
    setChatSearchQuery,
    highlightedMessageId,
    setHighlightedMessageId,
    s,
    h,
    mutedChatsById,
    setMutedChatsById,
    disappearingByContact,
    setDisappearingByContact,
    messageExpiryById,
    setMessageExpiryById,
    translatorEnabled,
    setTranslatorEnabled,
    translatorLang,
    setTranslatorLang,
    speechVoiceGender,
    setSpeechVoiceGender,
    translatedIncomingById,
    setTranslatedIncomingById,
    translatorError,
    setTranslatorError,
    showScrollDown,
    setShowScrollDown,
    followingCacheTick,
    setFollowingCacheTick,
    nowTick,
    setNowTick,
    pendingChatRequests,
    setPendingChatRequests,
    chatRequests,
    setChatRequests,
    sentChatRequests,
    setSentChatRequests,
    chatRequestsLoading,
    setChatRequestsLoading,
    chatRequestError,
    setChatRequestError,
    chatRequestBusyById,
    setChatRequestBusyById,
    storyItems,
    setStoryItems,
    storyViewerIndex,
    setStoryViewerIndex,
    storyViewerItems,
    setStoryViewerItems,
    storyViewerGroupKey,
    setStoryViewerGroupKey,
    storyOptionsItems,
    setStoryOptionsItems,
    storyOptionsGroupKey,
    setStoryOptionsGroupKey,
    activeStory,
    storyViewerSrc,
    setStoryViewerSrc,
    storyViewerMuted,
    setStoryViewerMuted,
    storyViewerLoading,
    setStoryViewerLoading,
    storyViewerLoadError,
    setStoryViewerLoadError,
    storyViewerMediaKind,
    setStoryViewerMediaKind,
    storyViewerBlobType,
    setStoryViewerBlobType,
    storyOptionsOpen,
    setStoryOptionsOpen,
    storyPlayerProgress,
    setStoryPlayerProgress,
    storyPlayerPaused,
    setStoryPlayerPaused,
    storyReactions,
    setStoryReactions,
    storyCommentDraft,
    setStoryCommentDraft,
    storyCommentOpen,
    setStoryCommentOpen,
    storyUsernamesById,
    setStoryUsernamesById,
    storyUsernamesByEmail,
    setStoryUsernamesByEmail,
    storyUsernamesRef,
    storyProfileLookupRef,
    reelPreviewLoadingRef,
    reelPosterLoadingRef,
    storyContactIndex,
    resolveStoryUsername,
    storyGroups,
    storyGroupsByKey,
    soundPrefs,
    setSoundPrefs,
    hasRemoteVideo,
    setHasRemoteVideo,
    hasRemoteAudio,
    setHasRemoteAudio,
    pipEnabled,
    setPipEnabled,
    pipActive,
    setPipActive,
    pipDismissedRef,
    groupPeersRef,
    groupStreamsRef,
    groupActiveRef,
    rejoinAttemptedRef,
    localVideoDragRef,
    isScreenShareStream,
    callPhaseNote,
    setCallPhaseNote,
    signAssistEnabled,
    setSignAssistEnabled,
    signAssistText,
    setSignAssistText,
    signAssistVoiceGender,
    setSignAssistVoiceGender,
    readAutoSpeakPrefs,
    autoSpeakPrefsRef,
    autoSpeakEnabledAtRef,
    signAssistAutoSpeak,
    setSignAssistAutoSpeak,
    signAssistContinuousMode,
    setSignAssistContinuousMode,
    signAssistBusy,
    setSignAssistBusy,
    signAssistStatus,
    setSignAssistStatus,
    blockedUsers,
    setBlockedUsers,
    chatWallpaper,
    setChatWallpaper,
    showWallpaperEditor,
    setShowWallpaperEditor,
    wallpaperDraft,
    setWallpaperDraft,
    replyDraft,
    setReplyDraft,
    stompRef,
    peerRef,
    localStreamRef,
    remoteStreamRef,
    localVideoRef,
    remoteVideoRef,
    screenStreamRef,
    cameraTrackRef,
    remoteAudioRef,
    livekitRoomRef,
    livekitRoomIdRef,
    livekitConnectingRef,
    callTimeoutRef,
    mediaConnectTimeoutRef,
    callStateRef,
    incomingCallRef,
    incomingCallPopupRef,
    incomingCallPopupDragRef,
    incomingCallPopupPosRef,
    activeCallPopupRef,
    activeCallPopupDragRef,
    activeCallPopupPosRef,
    callStartedAtRef,
    callConnectedLoggedRef,
    rejoinRetryTimerRef,
    rejoinRetryCountRef,
    rejoinPayloadRef,
    rejoinGraceUntilRef,
    audioCtxRef,
    remoteAudioCtxRef,
    remoteAudioSourceRef,
    remoteAudioGainRef,
    ringtoneTimerRef,
    outgoingRingTimerRef,
    customRingtoneAudioRef,
    disconnectGuardTimerRef,
    historyRef,
    storyLongPressTimeoutRef,
    storyLongPressTriggeredRef,
    storyViewerVideoRef,
    storyViewerCandidatesRef,
    storyViewerCandidateIndexRef,
    storyViewerBlobUrlRef,
    storyViewerBlobTriedRef,
    storyViewerLoadTimeoutRef,
    storyOptionsPausedRef,
    activeStoryIdRef,
    storyPlayerRafRef,
    storyPlayerDurationRef,
    storyPlayerElapsedRef,
    storyPlayerLastTickRef,
    storyPlayerPausedRef,
    viewedStoryIdsRef,
    storyFeedDisabledUntilRef,
    chatApiDisabledUntilRef,
    unreadPrefetchInFlightRef,
    unreadPrefetchLastAtRef,
    seenSignalsRef,
    longPressTimerRef,
    contactLongPressTimerRef,
    contactLongPressTriggeredRef,
    touchStartPointRef,
    touchSwipeReplyRef,
    tabIdRef,
    callChannelRef,
    readReceiptChannelRef,
    messageChannelRef,
    seenReadReceiptsRef,
    lastReadReceiptSentByContactRef,
    notifiedMessageKeysRef,
    messagesByContactRef,
    composerInputRef,
    attachInputRef,
    cameraInputRef,
    stickerInputRef,
    wallpaperInputRef,
    mediaRecorderRef,
    recordingStreamRef,
    recordingChunksRef,
    speechRecognitionRef,
    speechFinalTranscriptRef,
    speechInterimTranscriptRef,
    speechLastAppliedTextRef,
    headerMenuWrapRef,
    headerMenuRef,
    callMenuRef,
    utilityPanelRef,
    wallpaperPanelRef,
    chatSearchInputRef,
    sidebarMenuWrapRef,
    sidebarMenuRef,
    translationCacheRef,
    threadRef,
    shouldStickToBottomRef,
    lastThreadItemCountRef,
    scrollRafRef,
    openScrollPlanRef,
    showScrollDownRef,
    highlightTimerRef,
    spokenSignMessageIdsRef,
    autoSpeakBootstrappedByContactRef,
    signApiUnavailableRef,
    signLocalModelRef,
    signLocalModelLoadingRef,
    signLivePollTimerRef,
    signLastDetectedTextRef,
    signLastDetectedAtRef,
    signLiveBufferRef,
    signAssistSendingRef,
    signSequenceFramesRef,
    signSequenceModelRef,
    signSequenceModelLoadingRef,
    chatServerBaseRef,
    resolvingContactProfilesRef,
    convoLoadingRef,
    lastConvoPollRef,
    lastThreadPollRef,
    discoveryHydratedRef,
    localHydratedRef,
    TRANSLATE_LANG_OPTIONS,
    threadWallpaperStyle,
    selectChatWallpaperPreset,
    openWallpaperPicker,
    buildWallpaperDraft,
    openWallpaperEditor,
    closeWallpaperEditor,
    applyWallpaperEditor,
    onWallpaperPicked,
    updateWallpaperOptions,
    ensureAudioContext,
    ensureAudioReady,
    playTone,
    playNotificationPattern,
    playNotificationBeep,
    playMessageAlert,
    maybeShowBrowserNotification,
    stopRingtone,
    stopOutgoingRing,
    playCustomRingtoneLoop,
    startRingtone,
    startOutgoingRing,
    resumeRemoteAudio,
    applySpeakerState,
    kickstartRemotePlayback,
    localThreadKey,
    localChatStorageKey,
    filterLocalChatForUser,
    readLocalChat,
    writeLocalChat,
    readFollowingCache,
    normalizeFollowKey,
    writeFollowingCache,
    updateFollowCache,
    getFollowKeysForContact,
    readChatRequestCache,
    writeChatRequestCache,
    hiddenMessageStorageKey,
    readHiddenMessageMap,
    writeHiddenMessageMap,
    getHiddenMessageSetForContact,
    markMessageHiddenForMe,
    callHistoryStorageKey,
    readCallHistory,
    writeCallHistory,
    pushCallHistory,
    normalizeDisplayName,
    isGenericUserLabel,
    getContactDisplayName,
    pickClosestTimestamp,
    parseTimestampMs,
    normalizeTimestamp,
    toEpochMs,
    normalizeMessage,
    messageFingerprint,
    buildMessageAlertKey,
    shouldNotifyForMessage,
    getMessageListItemSignature,
    areMessageListsEquivalent,
    getContactSignature,
    areContactListsEquivalent,
    scrollThreadToBottom,
    refreshThreadScrollState,
    getVisibleThreadMessageIds,
    isPrivateIpHost,
    isLocalRuntime,
    isLocalAbsoluteHost,
    normalizeBaseCandidate,
    resolveAbsoluteChatBase,
    looksLikeHtmlPayload,
    isRetryableChatRouteStatus,
    persistChatServerBase,
    buildChatBaseCandidates,
    toArrayPayload,
    requestChatArray,
    requestChatMutation,
    requestChatObject,
    mapUserToContact,
    mergeContacts,
    extractContactsFromLocalHistory,
    buildGroupRoomId,
    resolveContactName,
    serializeGroupMembers,
    syncGroupRemoteTiles,
    sendSignal,
    clearCallTimer,
    clearMediaConnectTimer,
    armMediaConnectTimeout,
    armOutgoingCallTimeout,
    armIncomingCallTimeout,
    clearDisconnectGuardTimer,
    clearRejoinRetryTimer,
    setupRemoteAudioPipeline,
    updateRemoteMediaFlags,
    livekitEnabled,
    buildLivekitRoomId,
    disconnectLivekit,
    connectLivekit,
    stopStream,
    resetMedia,
    closePeer,
    closeSinglePeerOnly,
    resetGroupCall,
    finishCall,
    ensureLocalStream,
    createPeerConnection,
    createGroupPeerConnection,
    removeGroupPeer,
    ensureGroupMesh,
    closeGroupPeers,
    applySdpQualityHints,
    tuneSendersForQuality,
    attemptRejoin,
    ensureSignalContact,
    onSignal,
    onIncomingChatMessage,
    openGroupInvite,
    openNewGroup,
    toggleGroupInvite,
    startGroupCall,
    addPeopleToGroupCall,
    startOutgoingCall,
    getVideoSender,
    acceptIncomingCall,
    declineIncomingCall,
    toggleIncomingRingtoneMute,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    stopScreenShare,
    toggleScreenShare,
    upgradeCallToVideo,
    loadConversations,
    loadDiscoveryContacts,
    searchContacts,
    loadThread,
    isBlockedContact,
    followingCache,
    isFollowingContact,
    getRequestKey,
    getRequestStatus,
    setRequestStatus,
    setRequestStatusByIdentifiers,
    resolveChatRequestContact,
    resolveChatRequestIdentifiers,
    acceptChatRequest,
    rejectChatRequest,
    requestChatAccess,
    filteredContacts,
    newChatCandidates,
    outgoingRequestKeys,
    hasOutgoingRequest,
    filteredSentChatRequests,
    requestsTotal,
    canChatWith,
    openContact,
    startNewChat,
    toggleContactActions,
    startContactLongPress,
    stopContactLongPress,
    handleContactPointerUp,
    handleContactKeyDown,
    deleteConversation,
    activeContact,
    activeContactBlocked,
    activeContactKey,
    activeMuted,
    activeDisappearingValue,
    activeDisappearingMs,
    activeMessages,
    activeCallHistory,
    setActiveContactMuted,
    setActiveDisappearingSetting,
    upsertMessageExpiry,
    buildActiveDisappearingExpiryMs,
    getMessagePreviewLabel,
    mediaPanelItems,
    linkDocumentItems,
    normalizedChatSearchQuery,
    searchPanelItems,
    clampFutureTimestamp,
    formatLastSeen,
    hasExplicitOnlineFlag,
    normalizeOnlineValue,
    getExplicitOnlineValue,
    getPeerMessageActivityTs,
    getPeerCallActivityTs,
    getContactActivityTs,
    getContactPresenceTs,
    getContactPresence,
    resolveStoryMediaUrl,
    revokeStoryViewerBlobUrl,
    clearStoryViewerLoadTimer,
    buildStoryMediaCandidates,
    isStoryVideo,
    detectStoryMediaKind,
    inferStoryMediaKind,
    fetchStoryBlob,
    loadStoryViewerCandidate,
    tryBlobForStoryCandidate,
    handleStoryViewerMediaError,
    isMyStoryGroup,
    openStoryGroup,
    getStoryGroupLabel,
    closeStory,
    openStoryOptions,
    closeStoryOptions,
    deleteStoryItems,
    startStoryLongPress,
    cancelStoryLongPress,
    handleStoryTileClick,
    goNextStory,
    goPrevStory,
    resolvedStoryMediaUrl,
    resolvedStoryMediaKind,
    resolvedStoryIsVideo,
    stopStoryProgress,
    resetStoryProgress,
    runStoryProgress,
    pauseStoryPlayback,
    resumeStoryPlayback,
    handleStoryVideoLoaded,
    handleStoryVideoTimeUpdate,
    handleStoryVideoEnded,
    storyKeyFor,
    applyStoryStats,
    peerLatestMessageTs,
    headerPresenceText,
    sendTextPayload,
    sendMessage,
    sendSignAssistMessage,
    ensureSequenceModel,
    pushSequenceFrame,
    detectSequenceSignText,
    detectLocalSignText,
    resetSignLiveBuffer,
    flushSignLiveBuffer,
    pushSignLiveBuffer,
    handleContinuousSign,
    captureSignAssistFromVideo,
    speakSignAssistText,
    setAutoSpeakEnabled,
    setContinuousModeEnabled,
    processVisibleAutoSpeak,
    goToProfile,
    blockActiveContact,
    addComposerText,
    toggleEmojiTray,
    isFavoritePick,
    toggleFavoritePick,
    onEmojiPick,
    onStickerPick,
    onCustomStickerPick,
    removeCustomSticker,
    onStickerImagePicked,
    openStickerPicker,
    favoriteItemsForTray,
    sendMediaFile,
    onFilePicked,
    openAttachPicker,
    openCameraPicker,
    normalizeSpeechChunk,
    mergeSpeechChunks,
    stopSpeechTyping,
    toggleSpeechTyping,
    releaseRecordingStream,
    stopAudioRecording,
    toggleAudioRecording,
    callActive,
    openImagePreview,
    closeImagePreview,
    showVideoCallScreen,
    activeVideoFilter,
    startLocalVideoDrag,
    persistPopupPos,
    resetIncomingCallPopupPos,
    resetActiveCallPopupPos,
    startIncomingCallPopupDrag,
    startActiveCallPopupDrag,
    callStatusText,
    callLabel,
    formatCallStatus,
    formatCallCard,
    formatMessageTime,
    canTranslateMessage,
    getSpeakableIncomingPayload,
    translateText,
    getMessageTickState,
    getTickSymbol,
    formatDayLabel,
    formatCallDuration,
    resolveMediaUrl,
    threadItems,
    chatItems,
    sendVisibleReadReceipts,
    onThreadScroll,
    focusThreadMessage,
    openBubbleMenu,
    openBubbleMenuOnClick,
    onBubbleTouchStart,
    onBubbleTouchMove,
    onBubbleTouchEnd,
    closeBubbleMenu,
    hasDraft,
    getBubbleDownloadInfo,
    saveBubbleMedia,
    copyBubbleItem,
    deleteBubbleItem,
    deleteBubbleItemForEveryone,
    contactId,
  } = useChat();
  const [mediaFilter, setMediaFilter] = useState("all");
  const [storyInsightsOpen, setStoryInsightsOpen] = useState(false);
  const [storyInsightsTab, setStoryInsightsTab] = useState("engagement");
  const [storyInsightsLoading, setStoryInsightsLoading] = useState(false);
  const [storyInsightsError, setStoryInsightsError] = useState("");
  const [storyInsightsItems, setStoryInsightsItems] = useState([]);
  const [multiShareSelectedById, setMultiShareSelectedById] = useState({});
  const [multiShareSending, setMultiShareSending] = useState(false);
  const isMultiShareMode = Boolean(String(pendingShareDraft || "").trim());
  const selectedMultiShareIds = useMemo(
    () => Object.keys(multiShareSelectedById).filter((id) => multiShareSelectedById[id]),
    [multiShareSelectedById]
  );

  const [inlineSearchOpen, setInlineSearchOpen] = useState(false);
  const isInlineSearchOpen = inlineSearchOpen;

  useEffect(() => {
    if (isMultiShareMode) return;
    setMultiShareSelectedById({});
    setMultiShareSending(false);
  }, [isMultiShareMode]);

  const toggleMultiShareRecipient = useCallback((contactId) => {
    const id = String(contactId || "").trim();
    if (!id) return;
    setMultiShareSelectedById((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  const cancelMultiShare = useCallback(() => {
    if (multiShareSending) return;
    setMultiShareSelectedById({});
    setPendingShareDraft("");
    setShareHint("");
  }, [multiShareSending, setPendingShareDraft, setShareHint]);

  const sendMultiShare = useCallback(async () => {
    if (multiShareSending) return;
    const draft = String(pendingShareDraft || "").trim();
    if (!draft) return;
    const myId = String(myUserId || "").trim();
    const targetIds = Array.from(
      new Set(
        selectedMultiShareIds
          .map((id) => String(id || "").trim())
          .filter((id) => id && id !== myId)
      )
    );
    if (!targetIds.length) {
      setShareHint("Select at least one chat.");
      setTimeout(() => setShareHint(""), 1600);
      return;
    }

    setMultiShareSending(true);
    setError("");
    let sentCount = 0;
    let failedCount = 0;

    for (const targetId of targetIds) {
      // Use shared send pipeline so API/fallback behavior stays consistent.
      const ok = await sendTextPayload(draft, {
        targetContactId: targetId,
        previewText: draft
      });
      if (ok) sentCount += 1;
      else failedCount += 1;
    }

    setMultiShareSending(false);
    setMultiShareSelectedById({});
    if (sentCount > 0) {
      setPendingShareDraft("");
      setError("");
      setShareHint(
        failedCount > 0
          ? `Sent to ${sentCount} chat${sentCount === 1 ? "" : "s"}. Failed: ${failedCount}.`
          : `Sent to ${sentCount} chat${sentCount === 1 ? "" : "s"}.`
      );
    } else {
      setShareHint("Could not send. Try again.");
    }
    setTimeout(() => setShareHint(""), 2400);
  }, [
    multiShareSending,
    pendingShareDraft,
    myUserId,
    selectedMultiShareIds,
    sendTextPayload,
    setPendingShareDraft,
    setShareHint,
    setError
  ]);

  const getMediaItemType = useCallback((message) => {
    const mediaType = String(message?.mediaType || (message?.audioUrl ? "audio" : "")).toLowerCase();
    if (mediaType === "image" || mediaType === "video" || mediaType === "audio") return mediaType;
    return "other";
  }, []);

  const filteredMediaPanelItems = useMemo(() => {
    if (mediaFilter === "all") return mediaPanelItems;
    return mediaPanelItems.filter((message) => getMediaItemType(message) === mediaFilter);
  }, [mediaFilter, mediaPanelItems, getMediaItemType]);

  const mediaFilterCounts = useMemo(() => {
    const counts = { all: mediaPanelItems.length, image: 0, video: 0, audio: 0 };
    mediaPanelItems.forEach((message) => {
      const mediaType = getMediaItemType(message);
      if (mediaType === "image" || mediaType === "video" || mediaType === "audio") {
        counts[mediaType] += 1;
      }
    });
    return counts;
  }, [mediaPanelItems, getMediaItemType]);

  const jumpToSearchResult = useCallback((messageId) => {
    const key = String(messageId || "");
    if (!key) return;
    const thread = threadRef.current;
    if (!thread?.querySelectorAll) return;
    const target = Array.from(thread.querySelectorAll("[data-chat-msg-id]"))
      .find((node) => String(node?.getAttribute?.("data-chat-msg-id") || "") === key);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(key);
  }, [setHighlightedMessageId, threadRef]);

  const activeSearchIndex = useMemo(
    () => searchPanelItems.findIndex((item) => String(item?.id || "") === highlightedMessageId),
    [searchPanelItems, highlightedMessageId]
  );

  useEffect(() => {
    if (!isInlineSearchOpen) return;
    const rafId = requestAnimationFrame(() => chatSearchInputRef.current?.focus?.());
    return () => cancelAnimationFrame(rafId);
  }, [isInlineSearchOpen, chatSearchInputRef]);

  useEffect(() => {
    if (!isInlineSearchOpen) return;
    if (!normalizedChatSearchQuery || searchPanelItems.length === 0) {
      setHighlightedMessageId("");
      return;
    }
    if (activeSearchIndex >= 0) return;
    jumpToSearchResult(searchPanelItems[0]?.id);
  }, [
    activeSearchIndex,
    isInlineSearchOpen,
    jumpToSearchResult,
    normalizedChatSearchQuery,
    searchPanelItems,
    setHighlightedMessageId
  ]);

  const goToSearchMatch = useCallback((direction) => {
    if (!searchPanelItems.length) return;
    const baseIndex = activeSearchIndex >= 0 ? activeSearchIndex : 0;
    const delta = direction === "prev" ? -1 : 1;
    const nextIndex = (baseIndex + delta + searchPanelItems.length) % searchPanelItems.length;
    jumpToSearchResult(searchPanelItems[nextIndex]?.id);
  }, [activeSearchIndex, jumpToSearchResult, searchPanelItems]);

  const closeInlineSearch = useCallback(() => {
    setInlineSearchOpen(false);
    setChatSearchQuery("");
    setHighlightedMessageId("");
    setActiveUtilityPanel("");
  }, [setActiveUtilityPanel, setChatSearchQuery, setHighlightedMessageId]);

  const openHeaderUtilityPanel = useCallback((panel) => {
    if (panel === "search") {
      setInlineSearchOpen(true);
      setActiveUtilityPanel("");
    } else {
      setInlineSearchOpen(false);
      setActiveUtilityPanel(panel);
    }
    setShowHeaderMenu(false);
    setShowCallMenu(false);
    setShowWallpaperPanel(false);
  }, [setActiveUtilityPanel, setShowCallMenu, setShowHeaderMenu, setShowWallpaperPanel]);

  const openInlineSearch = useCallback(() => {
    if (isInlineSearchOpen) {
      closeInlineSearch();
      return;
    }
    openHeaderUtilityPanel("search");
  }, [closeInlineSearch, isInlineSearchOpen, openHeaderUtilityPanel]);

  useEffect(() => {
    if (!activeContactId) {
      setInlineSearchOpen(false);
      return;
    }
    setInlineSearchOpen(false);
  }, [activeContactId]);

  useEffect(() => {
    if (activeUtilityPanel !== "media") {
      setMediaFilter("all");
    }
  }, [activeUtilityPanel]);

  useEffect(() => {
    const onHeaderMenuPointerDownCapture = (event) => {
      const panelButton = event.target?.closest?.(".chat-header-menu-link[data-panel]");
      if (!panelButton) return;
      const panel = String(panelButton.getAttribute("data-panel") || "");
      if (!panel) return;
      openHeaderUtilityPanel(panel);
    };
    document.addEventListener("pointerdown", onHeaderMenuPointerDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onHeaderMenuPointerDownCapture, true);
    };
  }, [openHeaderUtilityPanel]);

  const closeStoryInsights = useCallback(() => {
    setStoryInsightsOpen(false);
    setStoryInsightsLoading(false);
    setStoryInsightsError("");
    setStoryInsightsItems([]);
    resumeStoryPlayback();
  }, [resumeStoryPlayback]);

  const openStoryInsights = useCallback(async (tab, story) => {
    const storyId = Number(story?.id || 0);
    if (!storyId) return;
    pauseStoryPlayback();
    setStoryInsightsTab(tab);
    setStoryInsightsOpen(true);
    setStoryInsightsLoading(true);
    setStoryInsightsError("");
    setStoryInsightsItems([]);
    try {
      const toItems = (payload) => (Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []));
      const toUserKey = (entry, idx, prefix) => {
        const id = String(entry?.userId ?? entry?.id ?? "").trim();
        if (id) return `id:${id}`;
        const email = String(entry?.email ?? entry?.userEmail ?? "").trim().toLowerCase();
        if (email) return `email:${email}`;
        const username = String(entry?.username ?? entry?.name ?? "").trim().toLowerCase();
        if (username) return `name:${username}`;
        return `${prefix}:${idx}`;
      };
      const toTs = (value) => {
        const n = Number(value);
        if (Number.isFinite(n)) return n > 1000000000000 ? n : n * 1000;
        const parsed = new Date(String(value || "")).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      };

      if (tab === "engagement") {
        const [viewsResult, likesResult] = await Promise.allSettled([
          api.get(`/api/stories/${storyId}/views`, { timeout: 12000 }),
          api.get(`/api/stories/${storyId}/likes`, { timeout: 12000 })
        ]);

        const viewsItems = viewsResult.status === "fulfilled" ? toItems(viewsResult.value?.data) : [];
        const likesItems = likesResult.status === "fulfilled" ? toItems(likesResult.value?.data) : [];

        if (viewsResult.status === "rejected" && likesResult.status === "rejected") {
          throw viewsResult.reason || likesResult.reason || new Error("Failed to load story engagement");
        }

        const merged = new Map();

        viewsItems.forEach((entry, idx) => {
          const key = toUserKey(entry, idx, "view");
          const viewedAt = entry?.viewedAt || entry?.createdAt || entry?.time || null;
          merged.set(key, {
            ...entry,
            viewedAt,
            likedAt: null,
            viewed: true,
            liked: false,
            _sortTs: toTs(viewedAt)
          });
        });

        likesItems.forEach((entry, idx) => {
          const key = toUserKey(entry, idx, "like");
          const likedAt = entry?.likedAt || entry?.createdAt || entry?.time || null;
          const existing = merged.get(key);
          if (existing) {
            merged.set(key, {
              ...existing,
              ...entry,
              viewed: true,
              liked: true,
              likedAt: likedAt || existing?.likedAt || null,
              _sortTs: Math.max(existing?._sortTs || 0, toTs(likedAt))
            });
            return;
          }
          merged.set(key, {
            ...entry,
            viewedAt: entry?.viewedAt || likedAt || null,
            likedAt,
            viewed: true,
            liked: true,
            _sortTs: toTs(likedAt)
          });
        });

        const rows = Array.from(merged.values())
          .sort((a, b) => (b?._sortTs || 0) - (a?._sortTs || 0))
          .map((entry) => {
            const { _sortTs, ...rest } = entry || {};
            return rest;
          });

        setStoryInsightsItems(rows);
      } else {
        const res = await api.get(`/api/stories/${storyId}/${tab}`, { timeout: 12000 });
        setStoryInsightsItems(toItems(res?.data));
      }
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to load story insights";
      setStoryInsightsError(String(message));
    } finally {
      setStoryInsightsLoading(false);
    }
  }, [pauseStoryPlayback]);

  const shareStoryItem = useCallback(async (candidate) => {
    const target = candidate || activeStory || storyOptionsItems[0];
    if (!target) return;

    const label = String(target?.storyText || target?.caption || "Check this story").trim() || "Check this story";
    const mediaUrl = String(resolveStoryMediaUrl(target?.mediaUrl || target?.url || "")).trim();
    const fallbackUrl =
      target?.id && typeof window !== "undefined"
        ? `${window.location.origin}/api/stories/media/${encodeURIComponent(String(target.id))}`
        : "";
    const shareUrl = mediaUrl || fallbackUrl;
    const shareText = `${label}${shareUrl ? ` ${shareUrl}` : ""}`.trim();

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: label,
          text: shareText,
          url: shareUrl || undefined
        });
        setShareHint("Story shared.");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText || label);
        setShareHint("Story link copied.");
      } else {
        setShareHint("Share is not supported on this device.");
      }
    } catch (err) {
      if (String(err?.name || "").toLowerCase() !== "aborterror") {
        setShareHint("Could not share story.");
      }
    } finally {
      setTimeout(() => setShareHint(""), 1800);
      closeStoryOptions();
    }
  }, [activeStory, closeStoryOptions, resolveStoryMediaUrl, setShareHint, storyOptionsItems]);

  useEffect(() => {
    if (storyViewerIndex != null && activeStory) return;
    setStoryInsightsOpen(false);
    setStoryInsightsLoading(false);
    setStoryInsightsError("");
    setStoryInsightsItems([]);
  }, [storyViewerIndex, activeStory]);
  return (
    <div className={`chat-page ${isConversationRoute ? "chat-single-pane" : "chat-list-only"}`}>
      {!isConversationRoute && !isRequestsRoute && (
        <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h2>Messages</h2>
          <div className="chat-sidebar-actions" ref={sidebarMenuWrapRef}>
            <button
              type="button"
              className="chat-sidebar-menu-btn"
              onClick={() => setShowSidebarMenu((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={showSidebarMenu}
              title="More options"
            >
              <FiMoreVertical />
            </button>

            {showSidebarMenu && (
              <aside className="chat-sidebar-menu" ref={sidebarMenuRef} role="menu" aria-label="Chat options">
                <button
                  type="button"
                  className="chat-sidebar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowSidebarMenu(false);
                    openNewGroup();
                  }}
                >
                  <span className="chat-sidebar-menu-left">
                    <FiUsers /> New Group
                  </span>
                </button>
                <button
                  type="button"
                  className="chat-sidebar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowSidebarMenu(false);
                    navigate("/chat/requests");
                  }}
                >
                  <span className="chat-sidebar-menu-left">
                    <FiUserPlus /> Requests
                  </span>
                  {requestsTotal > 0 && <span className="chat-requests-count">{requestsTotal}</span>}
                </button>
                <button
                  type="button"
                  className="chat-sidebar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowSidebarMenu(false);
                    setNewChatOpen(true);
                  }}
                >
                  <span className="chat-sidebar-menu-left">
                    <FiMessageCircle /> New Chat
                  </span>
                </button>
              </aside>
            )}
          </div>
        </div>
        <div className="chat-stories">
          <div className="chat-stories-head">
            <h3>Stories</h3>
            <button type="button" className="chat-story-add" onClick={() => navigate("/story/create")}>
              + Add
            </button>
          </div>
          <div className="chat-stories-row">
            <button type="button" className="chat-story-tile add" onClick={() => navigate("/story/create")}>
              <span className="chat-story-thumb">+</span>
              <small>Your story</small>
            </button>
            {storyGroups.map((group) => {
              const story = group.latest || group.items[0];
              const mediaUrl = resolveStoryMediaUrl(story?.mediaUrl || story?.url || "");
              const isVideo = isStoryVideo(mediaUrl);
              const baseLabel = getStoryGroupLabel(group);
              const label =
                group.items.length > 1 ? `${baseLabel} (${group.items.length})` : baseLabel;
              return (
                <button
                  key={group.key}
                  type="button"
                  className="chat-story-tile"
                  onClick={() => handleStoryTileClick(group)}
                  onPointerDown={startStoryLongPress(group)}
                  onPointerUp={cancelStoryLongPress}
                  onPointerLeave={cancelStoryLongPress}
                  onPointerCancel={cancelStoryLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isMyStoryGroup(group)) openStoryOptions(group);
                  }}
                >
                  <span className="chat-story-thumb">
                    {mediaUrl ? (
                      isVideo ? (
                        <video src={mediaUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={mediaUrl} alt={label} />
                      )
                    ) : (
                      <span className="chat-story-fallback">{label.slice(0, 1).toUpperCase()}</span>
                    )}
                    {isVideo && <span className="chat-story-play">Ã¢â€“Â¶</span>}
                  </span>
                  <small>{label.length > 14 ? `${label.slice(0, 12)}...` : label}</small>
                </button>
              );
            })}
            {storyGroups.length === 0 && (
              <p className="chat-story-empty">No stories yet</p>
            )}
          </div>
        </div>
        <input
          type="text"
          className="chat-search"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="chat-error">{error}</p>}
        {!error && !!shareHint && <p className="chat-empty">{shareHint}</p>}
        {isMultiShareMode && (
          <div className="chat-share-multi-bar">
            <div className="chat-share-multi-copy">
              <strong>Share To Multiple Chats</strong>
              <small>{selectedMultiShareIds.length} selected</small>
            </div>
            <div className="chat-share-multi-actions">
              <button
                type="button"
                className="chat-share-multi-btn is-ghost"
                onClick={cancelMultiShare}
                disabled={multiShareSending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="chat-share-multi-btn"
                onClick={sendMultiShare}
                disabled={multiShareSending || selectedMultiShareIds.length === 0}
              >
                {multiShareSending ? "Sending..." : `Send (${selectedMultiShareIds.length})`}
              </button>
            </div>
          </div>
        )}
        <div className="chat-contact-list">
           {filteredContacts.map((c) => {
             const presence = getContactPresence(c);
             const displayName = getContactDisplayName(c);
             const contactId = c?.id != null ? String(c.id) : "";
             const isActive = isConversationRoute && String(activeContactId) === contactId;
             const unreadCount = contactId
               ? Math.max(0, Math.floor(Number(threadReadState?.[contactId]?.unread || 0)))
               : 0;
             const threadMessages = contactId && Array.isArray(messagesByContact?.[contactId])
               ? messagesByContact[contactId]
               : [];
             const threadLast = threadMessages.length ? threadMessages[threadMessages.length - 1] : null;
             const serverPreview = String(c?.lastMessage || "").trim();
             const serverPreviewTs = toEpochMs(c?.lastMessageAt || 0);
             const threadPreview = String(getMessagePreviewLabel(threadLast) || "").trim();
             const threadPreviewTs = toEpochMs(threadLast?.createdAt || 0);
             const contactCallHistory = contactId && Array.isArray(callHistoryByContact?.[contactId])
               ? callHistoryByContact[contactId]
               : [];
             const latestCall = contactCallHistory.reduce((latest, entry) => {
               const entryTs = toEpochMs(entry?.at || 0);
               if (!Number.isFinite(entryTs) || entryTs <= 0) return latest;
               if (!latest) return entry;
               const latestTs = toEpochMs(latest?.at || 0);
               return entryTs >= latestTs ? entry : latest;
             }, null);
             const callPreview = latestCall ? String(formatCallStatus(latestCall) || "").trim() : "";
             const callPreviewTs = toEpochMs(latestCall?.at || 0);

             const previewCandidates = [
               { text: threadPreview, ts: threadPreviewTs },
               { text: callPreview, ts: callPreviewTs },
               { text: serverPreview, ts: serverPreviewTs }
             ].filter((item) => String(item?.text || "").trim());
             const newestTimedPreview = previewCandidates
               .filter((item) => Number.isFinite(item.ts) && item.ts > 0)
               .sort((a, b) => b.ts - a.ts)[0];
             const previewText =
               newestTimedPreview?.text ||
               threadPreview ||
               callPreview ||
               serverPreview ||
               "Tap to start chatting";
             const showUnread = unreadCount > 0 && !isActive;
             const showActions = Boolean(contactId) && String(contactActionId) === contactId && !isMultiShareMode;
             const isShareSelected = isMultiShareMode && Boolean(multiShareSelectedById[contactId]);
             const contactKey = contactId || c?.email || displayName;
             return (
               <div key={contactKey} className={`chat-contact-card ${isActive ? "active" : ""}`}>
                 <button
                   type="button"
                   className={`chat-contact ${isActive ? "active" : ""} ${showUnread ? "has-unread" : ""} ${isShareSelected ? "is-share-selected" : ""}`}
                   onPointerDown={isMultiShareMode ? undefined : startContactLongPress(contactId)}
                   onPointerUp={(e) => {
                     if (isMultiShareMode) {
                       e.preventDefault();
                       e.stopPropagation();
                       toggleMultiShareRecipient(contactId);
                       return;
                     }
                     handleContactPointerUp(e, c);
                   }}
                   onPointerLeave={isMultiShareMode ? undefined : stopContactLongPress}
                   onPointerCancel={isMultiShareMode ? undefined : stopContactLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isMultiShareMode) return;
                    toggleContactActions(contactId);
                  }}
                  onDoubleClick={() => {
                    if (isMultiShareMode) return;
                    openContact(c);
                  }}
                  onKeyDown={(e) => {
                    if (isMultiShareMode) {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleMultiShareRecipient(contactId);
                      }
                      return;
                    }
                    handleContactKeyDown(e, c);
                  }}
                >
                  <span className="chat-avatar">
                    {c.profilePic ? <img src={c.profilePic} alt={displayName} className="chat-avatar-img" /> : c.avatar}
                    <span className={`chat-presence-dot ${presence.online ? "is-online" : ""}`} />
                  </span>
                  <span className="chat-meta">
                    <span className="chat-meta-row">
                      <strong>{displayName}</strong>
                      <span className={`chat-status-pill ${presence.online ? "is-online" : ""}`}>
                        {presence.text}
                      </span>
                     </span>
                     <small>{previewText}</small>
                    </span>
                   <span className="chat-contact-right" aria-hidden={!showUnread && !isMultiShareMode}>
                     {isMultiShareMode ? (
                       <span className={`chat-share-target-toggle ${isShareSelected ? "selected" : ""}`}>
                         {isShareSelected ? "✓" : ""}
                       </span>
                     ) : showUnread ? (
                       <span className="chat-unread-badge" aria-label={`${unreadCount} unread messages`}>
                         {unreadCount > 99 ? "99+" : unreadCount}
                       </span>
                     ) : null}
                   </span>
                 </button>
                 {showActions && (
                   <div className="chat-contact-actions">
                     <button
                      type="button"
                      className="chat-contact-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteConversation(c);
                      }}
                    >
                      Delete chat
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!error && filteredContacts.length === 0 && <p className="chat-empty">No users found</p>}
        </div>

        {newChatOpen && (
          <div className="new-chat-modal-backdrop" onClick={() => setNewChatOpen(false)}>
            <div className="new-chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="new-chat-top">
                <h4>Start New Chat</h4>
                <button type="button" onClick={() => setNewChatOpen(false)}>
                  x
                </button>
              </div>
              <input
                type="text"
                className="chat-search"
                placeholder="Search people"
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
              />
              <div className="new-chat-list">
                {searchingUsers && <p className="chat-empty">Searching users...</p>}
                {newChatCandidates.map((c) => {
                  const displayName = getContactDisplayName(c);
                  const canChat = canChatWith(c);
                  const outgoingPending = hasOutgoingRequest(c);
                  const rawRequestStatus = getRequestStatus(c);
                  const cleanedStatus =
                    !chatRequestsLoading && !outgoingPending &&
                    (rawRequestStatus === "requested" || rawRequestStatus === "pending")
                      ? ""
                      : rawRequestStatus;
                  const requestStatus = isFollowingContact(c)
                    ? "following"
                    : outgoingPending
                      ? "requested"
                      : cleanedStatus;
                  const requestLabel =
                    requestStatus === "following"
                      ? "Following"
                      : requestStatus === "requested" || requestStatus === "pending"
                        ? "Requested"
                        : requestStatus === "error"
                          ? "Retry"
                          : "Request";
                  return (
                    <div key={c.id} className="chat-contact-row">
                      <button
                        type="button"
                        className={`chat-contact ${canChat ? "" : "is-locked"}`}
                        onClick={canChat ? () => startNewChat(c) : undefined}
                        disabled={!canChat}
                      >
                        <span className="chat-avatar">
                          {c.profilePic ? <img src={c.profilePic} alt={displayName} className="chat-avatar-img" /> : c.avatar}
                        </span>
                        <span className="chat-meta">
                          <strong>{displayName}</strong>
                          <small>{c.email || c.username || "Start conversation"}</small>
                        </span>
                      </button>
                      {!canChat && (
                        <button
                          type="button"
                          className="chat-request-btn"
                          onClick={() => requestChatAccess(c)}
                          disabled={requestStatus === "requested" || requestStatus === "pending"}
                        >
                          {requestLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
                {!searchingUsers && newChatCandidates.length === 0 && <p className="chat-empty">No users found</p>}
              </div>
            </div>
          </div>
        )}
        </aside>
      )}

      {!isConversationRoute && isRequestsRoute && (
        <section className="chat-requests-page">
          <div className="chat-requests-page-head">
            <button
              type="button"
              className="chat-requests-back"
              onClick={() => navigate("/chat")}
            >
              <FiArrowLeft /> Back
            </button>
            <h2>Chat Requests</h2>
            <span className="chat-requests-summary">
              {chatRequests.length} incoming / {filteredSentChatRequests.length} sent
            </span>
          </div>
          <div className="chat-requests-grid">
            <div className="chat-requests">
              <div className="chat-requests-head">
                <h3>Incoming</h3>
                {chatRequests.length > 0 && <span className="chat-requests-count">{chatRequests.length}</span>}
              </div>
              <div className="chat-requests-list">
                {chatRequestsLoading && <p className="chat-request-empty">Loading requests...</p>}
                {!chatRequestsLoading && !chatRequestError && chatRequests.length === 0 && (
                  <p className="chat-request-empty">No new requests</p>
                )}
                {chatRequestError && <p className="chat-request-error">{chatRequestError}</p>}
                {chatRequests.map((req) => {
                  const contact = resolveChatRequestContact(req);
                  if (!contact) return null;
                  const displayName = getContactDisplayName(contact);
                  const requestId = String(req?.id || "").trim();
                  const busy = Boolean(requestId && chatRequestBusyById[requestId]);
                  const actionable = Boolean(requestId);
                  return (
                    <div key={requestId || contact.id} className="chat-request-card">
                      <span className="chat-avatar">
                        {contact.profilePic ? (
                          <img src={contact.profilePic} alt={displayName} className="chat-avatar-img" />
                        ) : (
                          contact.avatar
                        )}
                      </span>
                      <span className="chat-request-meta">
                        <strong>{displayName}</strong>
                        <small>{contact.email || contact.username || "Chat request"}</small>
                      </span>
                      <div className="chat-request-actions">
                        <button
                          type="button"
                          className="chat-request-btn accept"
                          onClick={() => acceptChatRequest(req)}
                          disabled={!actionable || busy}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="chat-request-btn reject"
                          onClick={() => rejectChatRequest(req)}
                          disabled={!actionable || busy}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="chat-requests chat-requests-sent">
              <div className="chat-requests-head">
                <h3>Sent</h3>
                {filteredSentChatRequests.length > 0 && (
                  <span className="chat-requests-count">{filteredSentChatRequests.length}</span>
                )}
              </div>
              <div className="chat-requests-list">
                {chatRequestsLoading && filteredSentChatRequests.length === 0 && (
                  <p className="chat-request-empty">Loading requests...</p>
                )}
                {!chatRequestsLoading && filteredSentChatRequests.length === 0 && (
                  <p className="chat-request-empty">No sent requests</p>
                )}
                {filteredSentChatRequests.map((req) => {
                  const contact = resolveChatRequestContact(req);
                  if (!contact) return null;
                  const displayName = getContactDisplayName(contact);
                  return (
                    <div key={`sent-${req?.id || contact.id}`} className="chat-request-card">
                      <span className="chat-avatar">
                        {contact.profilePic ? (
                          <img src={contact.profilePic} alt={displayName} className="chat-avatar-img" />
                        ) : (
                          contact.avatar
                        )}
                      </span>
                      <span className="chat-request-meta">
                        <strong>{displayName}</strong>
                        <small>{contact.email || contact.username || "Awaiting response"}</small>
                      </span>
                      <span className="chat-request-status">Pending</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {isConversationRoute && (
      <section className={`chat-main ${showHeaderMenu ? "settings-open" : ""}`}>
        {!activeContact && <p className="chat-placeholder">{isConversationRoute ? "Loading conversation..." : "Select a conversation"}</p>}

        {activeContact && (
          <>
            <ChatHeader onOpenUtilityPanel={openHeaderUtilityPanel} onOpenSearch={openInlineSearch} />
            {isInlineSearchOpen && (
              <div className="chat-inline-search" data-no-page-swipe>
                <label className="chat-inline-search-field">
                  <FiSearch />
                  <input
                    ref={chatSearchInputRef}
                    type="search"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        goToSearchMatch(e.shiftKey ? "prev" : "next");
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        closeInlineSearch();
                      }
                    }}
                    placeholder="Search in chat"
                  />
                  {!!chatSearchQuery && (
                    <button
                      type="button"
                      className="chat-inline-search-icon-btn"
                      onClick={() => setChatSearchQuery("")}
                      title="Clear"
                      aria-label="Clear search"
                    >
                      <FiX />
                    </button>
                  )}
                </label>
                <div className="chat-inline-search-controls">
                  <small className="chat-inline-search-count">
                    {normalizedChatSearchQuery
                      ? `${searchPanelItems.length === 0 ? 0 : activeSearchIndex + 1} / ${searchPanelItems.length}`
                      : "0 / 0"}
                  </small>
                  <button
                    type="button"
                    className="chat-inline-search-nav"
                    onClick={() => goToSearchMatch("prev")}
                    disabled={!searchPanelItems.length}
                    title="Previous match"
                    aria-label="Previous match"
                  >
                    <FiChevronUp />
                  </button>
                  <button
                    type="button"
                    className="chat-inline-search-nav"
                    onClick={() => goToSearchMatch("next")}
                    disabled={!searchPanelItems.length}
                    title="Next match"
                    aria-label="Next match"
                  >
                    <FiChevronDown />
                  </button>
                </div>
              </div>
            )}
            {showWallpaperPanel && (
              <div className="chat-wallpaper-panel-backdrop" onClick={() => setShowWallpaperPanel(false)}>
                <div
                  className="chat-wallpaper-panel"
                  ref={wallpaperPanelRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="chat-wallpaper-panel-head">
                    <div className="chat-wallpaper-panel-title">
                      <strong>Chat wallpaper</strong>
                      <small>Choose background picture for this chat page</small>
                    </div>
                    <button
                      type="button"
                      className="chat-wallpaper-close"
                      onClick={() => setShowWallpaperPanel(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="chat-wallpaper-grid">
                    {CHAT_WALLPAPER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`chat-wallpaper-chip ${chatWallpaper?.presetId === preset.id ? "is-active" : ""}`}
                        onClick={() => selectChatWallpaperPreset(preset.id)}
                      >
                        <span
                          className="chat-wallpaper-chip-preview"
                          style={preset.image ? { backgroundImage: `url("${preset.image}")` } : undefined}
                        />
                        <small>{preset.label}</small>
                      </button>
                    ))}
                  </div>
                  <div className="chat-wallpaper-actions">
                    <button type="button" className="chat-wallpaper-upload" onClick={openWallpaperPicker}>
                      Upload Picture
                    </button>
                    {!!chatWallpaper?.image && (
                      <button
                        type="button"
                        className="chat-wallpaper-upload"
                        onClick={() => openWallpaperEditor(chatWallpaper)}
                      >
                        Preview / Adjust
                      </button>
                    )}
                    <button
                      type="button"
                      className="chat-wallpaper-upload secondary"
                      onClick={() => selectChatWallpaperPreset("none")}
                    >
                      Remove
                    </button>
                    <input
                      ref={wallpaperInputRef}
                      type="file"
                      accept="image/*"
                      className="chat-hidden-file-input"
                      onChange={onWallpaperPicked}
                    />
                  </div>
                </div>
              </div>
            )}
            {activeUtilityPanel && activeUtilityPanel !== "search" && (
              <div className="chat-utility-panel-backdrop" onClick={() => setActiveUtilityPanel("")}>
                <div
                  className="chat-utility-panel"
                  ref={utilityPanelRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="chat-utility-panel-head">
                    <div className="chat-utility-panel-title">
                      <strong>
                        {activeUtilityPanel === "media" ? "Media" : "Links and documents"}
                      </strong>
                      <small>
                        {activeUtilityPanel === "media"
                          ? `${mediaPanelItems.length} shared item${mediaPanelItems.length === 1 ? "" : "s"}`
                          : `${linkDocumentItems.length} link or document${linkDocumentItems.length === 1 ? "" : "s"}`}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="chat-wallpaper-close"
                      onClick={() => setActiveUtilityPanel("")}
                    >
                      Close
                    </button>
                  </div>

                  {activeUtilityPanel === "media" && (
                    <div className="chat-utility-list">
                      <div className="chat-utility-filter-row" role="tablist" aria-label="Media type filter">
                        {MEDIA_FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`chat-utility-filter-chip ${mediaFilter === option.value ? "is-active" : ""}`}
                            onClick={() => setMediaFilter(option.value)}
                            role="tab"
                            aria-selected={mediaFilter === option.value}
                          >
                            <span>{option.label}</span>
                            <small>{mediaFilterCounts[option.value] ?? 0}</small>
                          </button>
                        ))}
                      </div>
                      {mediaPanelItems.length === 0 ? (
                        <p className="chat-utility-empty">No media shared in this chat yet.</p>
                      ) : filteredMediaPanelItems.length === 0 ? (
                        <p className="chat-utility-empty">No {mediaFilter} media found in this chat.</p>
                      ) : (
                        filteredMediaPanelItems.map((message) => {
                          const mediaType = String(message?.mediaType || (message?.audioUrl ? "audio" : "")).toLowerCase();
                          const mediaHref = message?.audioUrl ? toApiUrl(message.audioUrl) : resolveMediaUrl(message?.mediaUrl);
                          const mediaTypeLabel =
                            mediaType === "image" ? "Image" : mediaType === "video" ? "Video" : mediaType === "audio" ? "Audio" : "Media";
                          return (
                            <button
                              key={String(message?.id || mediaHref)}
                              type="button"
                              className={`chat-utility-item chat-utility-media-item media-${mediaType || "other"}`}
                              onClick={() => focusThreadMessage(message?.id)}
                            >
                              <span className={`chat-utility-item-media media-${mediaType || "other"}`}>
                                {mediaType === "image" && mediaHref ? (
                                  <img src={mediaHref} alt={message?.fileName || "Media"} className="chat-utility-thumb" />
                                ) : mediaType === "video" && mediaHref ? (
                                  <video src={mediaHref} className="chat-utility-thumb" muted playsInline preload="metadata" />
                                ) : (
                                  <span className="chat-utility-media-icon">
                                    <FiVolume2 />
                                  </span>
                                )}
                                <span className="chat-utility-thumb-overlay">{mediaTypeLabel}</span>
                              </span>
                              <span className="chat-utility-item-body">
                                <span className="chat-utility-item-meta">
                                  <span className={`chat-utility-type-badge ${mediaType || "other"}`}>
                                    {mediaType === "image" ? <FiImage /> : mediaType === "video" ? <FiVideo /> : mediaType === "audio" ? <FiMusic /> : <FiFileText />}
                                    {mediaTypeLabel}
                                  </span>
                                  <small>
                                    {new Date(message?.createdAt || Date.now()).toLocaleString([], {
                                      day: "numeric",
                                      month: "short",
                                      hour: "numeric",
                                      minute: "2-digit"
                                    })}
                                  </small>
                                </span>
                                <strong>{trimReplyPreview(getMessagePreviewLabel(message), 76)}</strong>
                                <small className="chat-utility-item-hint">Tap to open in chat</small>
                              </span>
                              <span className="chat-utility-item-arrow" aria-hidden="true">
                                <FiChevronRight />
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}

                  {activeUtilityPanel === "links-documents" && (
                    <div className="chat-utility-list">
                      {linkDocumentItems.length === 0 ? (
                        <p className="chat-utility-empty">No links or documents shared in this chat yet.</p>
                      ) : (
                        linkDocumentItems.map((entry) => (
                          <a
                            key={entry.id}
                            className="chat-utility-item chat-utility-link-item"
                            href={entry.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="chat-utility-media-icon">
                              {entry.type === "document" ? <FiFileText /> : <FiLink />}
                            </span>
                            <span className="chat-utility-item-body">
                              <strong>{trimReplyPreview(entry.label, 90)}</strong>
                              <small>
                                {entry.type === "document" ? "Document" : "Link"} Ã‚Â·{" "}
                                {new Date(entry?.message?.createdAt || Date.now()).toLocaleString([], {
                                  day: "numeric",
                                  month: "short",
                                  hour: "numeric",
                                  minute: "2-digit"
                                })}
                              </small>
                            </span>
                            <FiChevronRight />
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(incomingCall || (callActive && callState.mode === "audio") || callError) && (
              <div className="call-panel">
                {callLabel && <p className="call-status">{callLabel}</p>}
                {callError && <p className="call-error">{callError}</p>}

                {incomingCall && (
                  <div className="incoming-call-actions">
                    <button type="button" className="call-accept" onClick={acceptIncomingCall}>
                      {incomingCall.mode === "video" ? <FiVideo /> : <FiPhone />} Attend
                    </button>
                    <button type="button" className="call-decline" onClick={declineIncomingCall}>
                      <FiPhoneOff /> Decline
                    </button>
                  </div>
                )}

                {callActive && (
                  <>
                    {callState.mode === "audio" && (
                      <div className="audio-call-pill">
                        <span>{callState.peerName || "User"}</span>
                      </div>
                    )}

                    <div className="in-call-controls">
                      <button type="button" className="call-control" onClick={toggleMute} title="Mute mic">
                        {isMuted ? <FiMicOff /> : <FiMic />}
                      </button>
                      <button type="button" className="call-control" onClick={toggleSpeaker} title="Speaker on/off">
                        {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />}
                      </button>
                      {callState.mode === "audio" && (
                        <>
                          <button type="button" className="call-control" onClick={upgradeCallToVideo} title="Switch to video">
                            <FiVideo />
                          </button>
                          <button
                            type="button"
                            className="call-control"
                            onClick={openGroupInvite}
                            title="Group video call"
                            disabled={!!incomingCall}
                          >
                            <FiUsers />
                          </button>
                        </>
                      )}
                      <button type="button" className="call-hangup" onClick={() => finishCall(true)}>
                        <FiPhoneOff />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="chat-thread wa-thread"
              style={threadWallpaperStyle}
              data-no-page-swipe
            >

              {chatItems.map((item) => {
                if (item.kind === "day") {
                  return (
                    <div key={item.id} className="chat-day-sep">
                      {item.label}
                    </div>
                  );
                }
                const reelShare = item.kind === "message" ? extractReelShare(item.raw?.text || item.text) : null;
                const feedShare = item.kind === "message" ? extractFeedShare(item.raw?.text || item.text) : null;
                const senderName = item.mine
                  ? "You"
                  : String(activeContact?.name || activeContact?.username || "User").trim();
                const senderInitial = senderName ? senderName.charAt(0).toUpperCase() : "U";
                const shareCaption = (rawText, matchedLink) =>
                  String(rawText || "")
                    .replace(String(matchedLink || ""), "")
                    .replace(/\s+/g, " ")
                    .trim();
                const renderReelShareCard = (mediaUrl) => {
                  if (!reelShare) return null;
                  const openReel = () => {
                    if (reelShare?.href) navigate(reelShare.href);
                  };
                  const preview = reelShare?.id ? reelPreviewById[reelShare.id] : null;
                  const inlinePreviewSrc = resolveMediaUrl(reelShare?.src || "");
                  const inlinePreviewPoster = resolveMediaUrl(reelShare?.poster || "");
                  const previewSrc = mediaUrl || preview?.src || inlinePreviewSrc || "";
                  const previewPoster = preview?.poster || inlinePreviewPoster || reelPosterBySrc[previewSrc] || "";
                  return (
                    <div className="chat-reel-wrap">
                      <div className={`chat-reel-card ${item.mine ? "mine" : "their"}`}>
                        <button type="button" className="chat-reel-media" onClick={openReel}>
                          {previewSrc ? (
                            <video
                              className="chat-reel-video"
                              src={previewSrc}
                              poster={previewPoster || undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : previewPoster ? (
                            <img
                              className="chat-reel-video"
                              src={previewPoster}
                              alt="Reel preview"
                              loading="lazy"
                            />
                          ) : (
                            <div className="chat-reel-video chat-reel-placeholder">REEL</div>
                          )}
                          <div className="chat-reel-overlay">
                            <span className="chat-reel-play">Ã¢â€“Â¶</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                };
                const renderFeedShareCard = (mediaUrl) => {
                  if (!feedShare) return null;
                  const openSharedPost = () => {
                    if (feedShare?.href) {
                      navigate(feedShare.href);
                      return;
                    }
                    if (feedShare?.id) {
                      navigate(`/feed?post=${encodeURIComponent(feedShare.id)}`);
                      return;
                    }
                  };
                  const preview = feedShare?.id ? feedPreviewById[feedShare.id] : null;
                  const inlinePreviewSrc = resolveMediaUrl(feedShare?.src || "");
                  const inlinePreviewPoster = resolveMediaUrl(feedShare?.poster || "");
                  const previewSrc = mediaUrl || preview?.src || inlinePreviewSrc || "";
                  const previewPoster = preview?.poster || inlinePreviewPoster || reelPosterBySrc[previewSrc] || "";
                  const destinationLabel = feedShare?.kind === "watch" ? "Open in Long Videos" : "Open in Feed";
                  const title =
                    preview?.title ||
                    trimReplyPreview(
                      shareCaption(item.raw?.text || item.text, feedShare?.match) ||
                        (feedShare?.kind === "watch" ? "Shared long video" : "Shared video")
                    );
                  return (
                    <div className="chat-feed-share-wrap">
                      <button
                        type="button"
                        className={`chat-feed-share-card ${item.mine ? "mine" : "their"}`}
                        onClick={openSharedPost}
                      >
                        <div className="chat-feed-share-media">
                          {previewSrc ? (
                            <video
                              className="chat-feed-share-video"
                              src={previewSrc}
                              poster={previewPoster || undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : previewPoster ? (
                            <img
                              className="chat-feed-share-video"
                              src={previewPoster}
                              alt="Shared post preview"
                              loading="lazy"
                            />
                          ) : (
                            <div className="chat-feed-share-video chat-reel-placeholder">VIDEO</div>
                          )}
                          <span className="chat-feed-share-play">Ã¢â€“Â¶</span>
                        </div>
                        <div className="chat-feed-share-meta">
                          <strong>{title || "Shared video"}</strong>
                          <small>{destinationLabel}</small>
                        </div>
                      </button>
                    </div>
                  );
                };
                const enableBubbleMenu = item.kind === "message";
                const callCard = item.kind === "call" ? formatCallCard(item.raw) : null;
                return (
                  <div
                    key={item.id}
                    className={`chat-bubble ${
                      item.kind === "call" ? `call-log ${item.mine ? "mine" : "their"}` : item.mine ? "mine" : "their"
                    } ${
                      item.kind === "message" && String(item.raw?.id || "") === highlightedMessageId ? "is-highlighted" : ""
                    }`}
                    data-chat-msg-id={item.kind === "message" ? String(item.raw?.id || "") : undefined}
                    onContextMenu={enableBubbleMenu ? (e) => openBubbleMenu(e, item) : undefined}
                    onPointerUp={enableBubbleMenu ? (e) => openBubbleMenuOnClick(e, item) : undefined}
                    onTouchStart={enableBubbleMenu ? (e) => onBubbleTouchStart(item, e) : undefined}
                    onTouchMove={enableBubbleMenu ? (e) => onBubbleTouchMove(item, e) : undefined}
                    onTouchEnd={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                    onTouchCancel={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                  >
                    <div className={`chat-bubble-line ${item.kind === "call" ? "call-line" : ""}`}>
                      {item.kind === "message" && item.raw?.replyTo && (
                        <div className={`chat-reply-chip ${item.mine ? "mine" : "their"}`}>
                          <small>
                            {String(item.raw.replyTo.senderId || "") === String(myUserId)
                              ? "You"
                              : item.raw.replyTo.senderName || "Message"}
                          </small>
                          <span>{trimReplyPreview(item.raw.replyTo.preview || "Message")}</span>
                        </div>
                      )}
                      {item.kind === "message" && item.raw?.audioUrl ? (
                        <div className={`chat-voice-note ${item.mine ? "mine" : "their"}`}>
                          {item.mine && (
                            <span className="chat-voice-note-icon" aria-hidden="true">
                              <FiVolume2 />
                            </span>
                          )}
                          <audio controls preload="metadata" className="chat-audio" src={toApiUrl(item.raw.audioUrl)} />
                        </div>
                      ) : item.kind === "message" && item.raw?.mediaUrl ? (
                        (() => {
                          const mediaUrl = resolveMediaUrl(item.raw.mediaUrl);
                          const fileName = String(item.raw?.fileName || "");
                          const textLabel = String(item.raw?.text || "");
                          const looksAudio =
                            item.raw?.mediaType === "audio" ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(fileName) ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(textLabel) ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(mediaUrl);
                          if (looksAudio) {
                            return (
                              <div className={`chat-voice-note ${item.mine ? "mine" : "their"}`}>
                                {item.mine && (
                                  <span className="chat-voice-note-icon" aria-hidden="true">
                                    <FiVolume2 />
                                  </span>
                                )}
                                <audio controls preload="metadata" className="chat-audio" src={mediaUrl} />
                              </div>
                            );
                          }
                          if (item.raw?.mediaType === "image") {
                            return (
                              <button
                                type="button"
                                className="chat-media-image-btn"
                                onClick={() => openImagePreview(mediaUrl, fileName || "image")}
                              >
                                <img
                                  src={mediaUrl}
                                  alt={fileName || "image"}
                                  className="chat-media-image"
                                />
                              </button>
                            );
                          }
                          if (item.raw?.mediaType === "video") {
                            if (reelShare) {
                              return renderReelShareCard(mediaUrl);
                            }
                            if (feedShare) {
                              return renderFeedShareCard(mediaUrl);
                            }
                            return (
                              <video controls preload="metadata" className="chat-media-video" src={mediaUrl} />
                            );
                          }
                          return (
                            <a className="chat-file-link" href={mediaUrl} target="_blank" rel="noreferrer">
                              File: {fileName || "Download file"}
                            </a>
                          );
                        })()
                      ) : item.kind === "message" && reelShare ? (
                        renderReelShareCard("")
                      ) : item.kind === "message" && feedShare ? (
                        renderFeedShareCard("")
                      ) : item.kind === "message" && /^\[Attachment:\s*.+\]$/i.test(String(item.raw?.text || "")) ? (
                        <span className="chat-attachment-text">{String(item.raw?.text || "")}</span>
                      ) : item.kind === "call" ? (
                        <div className="call-card">
                          <span className={`call-dot ${callCard?.tone ? `is-${callCard.tone}` : ""}`} aria-hidden="true">
                            {callCard?.icon === "video" ? <FiVideo /> : callCard?.icon === "off" ? <FiPhoneOff /> : <FiPhone />}
                          </span>
                          <span className="call-card-text">
                            <strong>{callCard?.title || "Call"}</strong>
                            <small>{callCard?.subtitle || ""}</small>
                          </span>
                        </div>
                      ) : (
                        <>
                          <span>{decodeSignAssistText(item.raw?.text || item.text)?.text || item.text}</span>
                          {item.kind === "message" && decodeSignAssistText(item.raw?.text || item.text) && (
                            <small className="chat-sign-assist-badge">
                              Sign Assist - Voice: {decodeSignAssistText(item.raw?.text || item.text)?.voiceGender || "neutral"}
                            </small>
                          )}
                          {item.kind === "message" && canTranslateMessage(item.raw) && translatorEnabled && (() => {
                            const msgKey = String(item.raw?.id || `${item.raw?.createdAt}_${item.raw?.text}`);
                            const translated = String(translatedIncomingById[msgKey] || "").trim();
                            if (!translated) return null;
                            if (translated.toLowerCase() === String(item.text || "").trim().toLowerCase()) return null;
                            return (
                              <small className="chat-translated-text" title="Translated">
                                {translated}
                              </small>
                            );
                          })()}
                        </>
                      )}
                    </div>
                    <small className="chat-bubble-time">
                      {formatMessageTime(item.createdAt)}
                      {item.kind === "message" && item.mine && (item.raw?.audioUrl || item.raw?.mediaType === "audio") && (
                        <span className="chat-voice-status-icon" title="Voice note" aria-label="Voice note">
                          <FiVolume2 />
                        </span>
                      )}
                      {item.kind === "message" && item.mine && (() => {
                        const tickState = getMessageTickState(item.raw);
                        if (!tickState) return null;
                        return (
                          <span className={`chat-read-ticks ${tickState}`} aria-label={tickState}>
                            {getTickSymbol(tickState)}
                          </span>
                        );
                      })()}
                    </small>
                  </div>
                );
              })}
              {threadItems.length === 0 && <p className="chat-empty-thread">No messages yet. Say hi.</p>}
            </div>
            {showScrollDown && (
              <button
                type="button"
                className="chat-scroll-bottom-btn"
                onClick={() => scrollThreadToBottom("smooth")}
                aria-label="Scroll to latest message"
                title="Scroll down"
              >
                <FiChevronDown />
              </button>
            )}

            <ChatInput />
            {showWallpaperEditor && wallpaperDraft?.image && (
              <div className="chat-wallpaper-editor-backdrop" onClick={closeWallpaperEditor}>
                <div className="chat-wallpaper-editor" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-wallpaper-preview-head">
                    <strong>Live preview</strong>
                    <small>Adjust wallpaper as needed</small>
                  </div>
                  <div
                    className="chat-wallpaper-live-preview editor"
                    style={{
                      backgroundImage: `linear-gradient(rgba(2, 8, 16, 0.72), rgba(2, 8, 16, 0.78)), url("${wallpaperDraft.image}")`,
                      backgroundSize:
                        wallpaperDraft.fit === "contain"
                          ? `${Number(wallpaperDraft.zoom || 100)}% auto`
                          : wallpaperDraft.fit === "stretch"
                            ? "100% 100%"
                            : `${Number(wallpaperDraft.zoom || 100)}% ${Number(wallpaperDraft.zoom || 100)}%`,
                      backgroundPosition: `${Number(wallpaperDraft.x || 50)}% ${Number(wallpaperDraft.y || 50)}%`,
                      backgroundRepeat: "no-repeat"
                    }}
                  />
                  <div className="chat-wallpaper-control-grid">
                    <label className="chat-wallpaper-control">
                      <span>Fit</span>
                      <select
                        value={String(wallpaperDraft?.fit || "cover")}
                        onChange={(e) => updateWallpaperOptions({ fit: String(e.target.value || "cover") })}
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="stretch">Stretch</option>
                      </select>
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min="60"
                        max="220"
                        step="1"
                        value={Number(wallpaperDraft?.zoom || 100)}
                        onChange={(e) => updateWallpaperOptions({ zoom: Number(e.target.value) || 100 })}
                      />
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Horizontal</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(wallpaperDraft?.x || 50)}
                        onChange={(e) => updateWallpaperOptions({ x: Number(e.target.value) || 50 })}
                      />
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Vertical</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(wallpaperDraft?.y || 50)}
                        onChange={(e) => updateWallpaperOptions({ y: Number(e.target.value) || 50 })}
                      />
                    </label>
                  </div>
                  <div className="chat-wallpaper-editor-actions">
                    <button type="button" className="chat-wallpaper-upload secondary" onClick={closeWallpaperEditor}>
                      Cancel
                    </button>
                    <button type="button" className="chat-wallpaper-upload" onClick={applyWallpaperEditor}>
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
            {bubbleMenu && (
              <div className="bubble-menu-backdrop" onClick={closeBubbleMenu}>
                <div
                  className="bubble-menu"
                  style={{ top: bubbleMenu.y, left: bubbleMenu.x }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button type="button" onClick={copyBubbleItem}>Copy</button>
                  {getBubbleDownloadInfo(bubbleMenu?.item) && (
                    <button type="button" onClick={saveBubbleMedia}>Save to gallery</button>
                  )}
                  {bubbleMenu?.item?.kind === "message" && bubbleMenu?.item?.mine && (
                    <button type="button" className="bubble-menu-danger" onClick={deleteBubbleItemForEveryone}>
                      Delete for everyone
                    </button>
                  )}
                  <button type="button" onClick={deleteBubbleItem}>Delete</button>
                  <button type="button" onClick={closeBubbleMenu}>Cancel</button>
                </div>
              </div>
            )}
            {imagePreview && (
              <div className="chat-image-preview-backdrop" onClick={closeImagePreview}>
                <button
                  type="button"
                  className="chat-image-preview-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeImagePreview();
                  }}
                  aria-label="Close image preview"
                >
                  Ã—
                </button>
                <img
                  src={imagePreview.src}
                  alt={imagePreview.alt || "Image preview"}
                  className="chat-image-preview"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}
      </section>
      )}
      {storyViewerIndex != null && activeStory && (
        <div className="chat-story-viewer-backdrop" onClick={closeStory}>
          <div className="chat-story-player" onClick={(event) => event.stopPropagation()}>
            {(() => {
              const mediaUrl = resolvedStoryMediaUrl;
              const isVideo = resolvedStoryIsVideo;
              const label = String(activeStory?.storyText || activeStory?.caption || "").trim();
              const storyUserNameRaw = resolveStoryUsername(activeStory);
              const storyUserLabel = storyUserNameRaw
                ? storyUserNameRaw
                : String(activeStory?.userId || "") === String(myUserId || "")
                  ? "You"
                  : "Story";
              const isMyStoryItem = (() => {
                const storyUserId = String(getStoryUserIdValue(activeStory) || "").trim();
                if (storyUserId && myUserId && storyUserId === String(myUserId)) return true;
                const storyEmail = String(getStoryUserEmailValue(activeStory) || "").trim().toLowerCase();
                if (storyEmail && myEmail && storyEmail === String(myEmail || "").trim().toLowerCase()) return true;
                return false;
              })();
              const storyKey = storyKeyFor(activeStory, storyViewerIndex);
              const storyReaction = storyReactions?.[storyKey] || {};
              const storyLiked = Boolean(storyReaction.liked);
              const storyLikeCount = Number(activeStory?.likeCount || 0);
              const storyViewCount = Number(activeStory?.viewCount || 0);
              const storyPostedTime = formatMessageTime(
                activeStory?.createdAt || activeStory?.created || activeStory?.timestamp || activeStory?.time
              );
              const storyOptionsGroup = storyViewerGroupKey
                ? storyGroupsByKey.get(storyViewerGroupKey)
                : null;
              const openViewerOptions = () => {
                const fallbackGroup =
                  !storyOptionsGroup && storyViewerItems.length
                    ? { key: storyViewerGroupKey || "viewer", items: storyViewerItems }
                    : null;
                const target = storyOptionsGroup || fallbackGroup;
                if (target) openStoryOptions(target);
              };
              const toggleStoryLike = async () => {
                const nextLiked = !storyLiked;
                setStoryReactions((prev) => {
                  const current = prev?.[storyKey] || {};
                  return {
                    ...prev,
                    [storyKey]: { ...current, liked: nextLiked }
                  };
                });

                const storyId = activeStory?.id;
                if (!storyId) return;
                try {
                  let payload = null;
                  if (nextLiked) {
                    const res = await api.post(`/api/stories/${storyId}/like`);
                    payload = res?.data;
                  } else {
                    const res = await api.delete(`/api/stories/${storyId}/like`);
                    payload = res?.data;
                  }
                  if (payload && typeof payload === "object") {
                    applyStoryStats(storyId, {
                      likeCount: payload.likeCount,
                      commentCount: payload.commentCount,
                      viewCount: payload.viewCount,
                      likedByMe: Boolean(payload.liked)
                    });
                  }
                } catch {
                  setStoryReactions((prev) => {
                    const current = prev?.[storyKey] || {};
                    return {
                      ...prev,
                      [storyKey]: { ...current, liked: !nextLiked }
                    };
                  });
                }
              };
              const submitStoryComment = async () => {
                const text = String(storyCommentDraft || "").trim();
                if (!text) return;
                setStoryCommentDraft("");
                setStoryCommentOpen(false);
                const storyId = activeStory?.id;
                if (!storyId) return;
                try {
                  const res = await api.post(`/api/stories/${storyId}/comment`, { text });
                  const payload = res?.data;
                  if (payload && typeof payload === "object") {
                    applyStoryStats(storyId, {
                      likeCount: payload.likeCount,
                      commentCount: payload.commentCount,
                      viewCount: payload.viewCount,
                      likedByMe: Boolean(payload.liked)
                    });
                  }
                } catch {
                  // ignore comment failure
                }
              };
              return (
                <>
                  <div className="chat-story-progress">
                    {storyViewerItems.map((story, idx) => {
                      const key = story?.id ? `${story.id}` : `${idx}`;
                      let width = 0;
                      if (idx < storyViewerIndex) width = 100;
                      else if (idx === storyViewerIndex) width = Math.round(storyPlayerProgress * 100);
                      return (
                        <div key={key} className="chat-story-progress-bar">
                          <span style={{ width: `${width}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="chat-story-player-header">
                    <div className="chat-story-player-meta">
                      <strong>{storyUserLabel || "Story"}</strong>
                      <span>
                        {storyViewerIndex + 1}/{storyViewerItems.length}
                      </span>
                      {storyPostedTime && <span>Posted {storyPostedTime}</span>}
                    </div>
                    <div className="chat-story-player-actions">
                      {isVideo && mediaUrl && (
                        <button
                          type="button"
                          className="ghost"
                          aria-label={storyViewerMuted ? "Unmute story" : "Mute story"}
                          onClick={() => {
                            setStoryViewerMuted((prev) => {
                              const next = !prev;
                              if (storyViewerVideoRef.current) {
                                storyViewerVideoRef.current.muted = next;
                                if (!next) {
                                  storyViewerVideoRef.current.play?.().catch(() => {});
                                }
                              }
                              return next;
                            });
                          }}
                        >
                          {storyViewerMuted ? <FiVolumeX /> : <FiVolume2 />}
                        </button>
                      )}
                      {isMyStoryItem && (
                        <button
                          type="button"
                          className="ghost"
                          aria-label="Story options"
                          onClick={(event) => {
                            event.stopPropagation();
                            openViewerOptions();
                          }}
                        >
                          <FiMoreVertical />
                        </button>
                      )}
                      <button type="button" className="close" aria-label="Close story" onClick={closeStory}>
                        <FiX />
                      </button>
                    </div>
                  </div>
                  <div
                    className="chat-story-player-media"
                    onPointerDown={pauseStoryPlayback}
                    onPointerUp={resumeStoryPlayback}
                    onPointerLeave={resumeStoryPlayback}
                    onPointerCancel={resumeStoryPlayback}
                  >
                    {mediaUrl ? (
                      isVideo ? (
                        <video
                          key={mediaUrl}
                          ref={storyViewerVideoRef}
                          src={mediaUrl}
                          autoPlay
                          muted={storyViewerMuted}
                          playsInline
                          preload="auto"
                          controls={false}
                          onLoadedData={(event) => {
                            clearStoryViewerLoadTimer();
                            setStoryViewerLoading(false);
                            handleStoryVideoLoaded(event);
                          }}
                          onCanPlay={(event) => {
                            clearStoryViewerLoadTimer();
                            setStoryViewerLoading(false);
                            handleStoryVideoLoaded(event);
                          }}
                          onTimeUpdate={handleStoryVideoTimeUpdate}
                          onEnded={handleStoryVideoEnded}
                          onError={() => {
                            clearStoryViewerLoadTimer();
                            handleStoryViewerMediaError();
                          }}
                          onPlay={() => {
                            if (!storyPlayerPausedRef.current) {
                              setStoryPlayerPaused(false);
                            }
                          }}
                          onPause={() => {
                            if (!storyPlayerPausedRef.current) {
                              setStoryPlayerPaused(true);
                            }
                          }}
                        />
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={label}
                          onLoad={() => setStoryViewerLoading(false)}
                          onError={handleStoryViewerMediaError}
                        />
                      )
                    ) : (
                      <div className="chat-story-player-empty">Story media not available</div>
                    )}
                    {storyViewerLoading && <div className="chat-story-player-status">Loading story...</div>}
                    {storyViewerLoadError && (
                      <div className="chat-story-player-status error">{storyViewerLoadError}</div>
                    )}
                    {storyPlayerPaused && !storyViewerLoadError && (
                      <div className="chat-story-player-paused">Paused</div>
                    )}
                    {storyViewerItems.length > 1 && (
                      <div className="chat-story-player-nav">
                        <button
                          type="button"
                          className="prev"
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            goPrevStory();
                          }}
                          disabled={storyViewerIndex <= 0}
                          aria-label="Previous story"
                        />
                        <button
                          type="button"
                          className="next"
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            goNextStory();
                          }}
                          disabled={storyViewerIndex >= storyViewerItems.length - 1}
                          aria-label="Next story"
                        />
                      </div>
                    )}
                  </div>
                  {label && <p className="chat-story-player-caption">{label}</p>}
                  <div className="chat-story-reactions">
                    <span className="chat-story-reaction-user">{storyUserLabel || "Story"}</span>
                    <div className="chat-story-reaction-buttons">
                      {!isMyStoryItem && (
                        <button
                          type="button"
                          className={`chat-story-reaction-btn ${storyLiked ? "is-liked" : ""}`}
                          onClick={toggleStoryLike}
                        >
                          <FiHeart />
                          {storyLiked ? "Liked" : "Like"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="chat-story-reaction-btn"
                        onClick={() => {
                          if (storyCommentOpen) {
                            setStoryCommentOpen(false);
                            resumeStoryPlayback();
                            return;
                          }
                          setStoryCommentOpen(true);
                          pauseStoryPlayback();
                        }}
                      >
                        <FiMessageCircle />
                        Comment
                      </button>
                    </div>
                  </div>
                  {isMyStoryItem && (
                    <div className="chat-story-stats" aria-label="Story stats">
                      <button
                        type="button"
                        className="chat-story-stat chat-story-stat-engagement"
                        aria-label="Show viewed and liked users"
                        onClick={() => openStoryInsights("engagement", activeStory)}
                      >
                        <FiEye />
                        Viewed {formatStoryCount(storyViewCount)} | Likes {formatStoryCount(storyLikeCount)}
                      </button>
                    </div>
                  )}
                  {storyCommentOpen && (
                    <div className="chat-story-comment-row">
                      <input
                        type="text"
                        placeholder="Add a comment..."
                        value={storyCommentDraft}
                        onChange={(e) => setStoryCommentDraft(e.target.value)}
                      />
                      <button type="button" aria-label="Send comment" onClick={submitStoryComment}>
                        <FiSend />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
      {storyOptionsOpen && storyOptionsItems.length > 0 && (
        <div className="chat-story-options-backdrop" onClick={closeStoryOptions}>
          <div className="chat-story-options" onClick={(e) => e.stopPropagation()}>
            <h4>Story options</h4>
            <button
              type="button"
              onClick={() => {
                const currentStoryId = String(activeStory?.id || "").trim();
                const currentStory = currentStoryId
                  ? storyOptionsItems.find((item) => String(item?.id || "").trim() === currentStoryId)
                  : null;
                void shareStoryItem(currentStory || storyOptionsItems[0]);
              }}
            >
              {storyOptionsItems.length > 1 ? "Share latest story" : "Share story"}
            </button>
            <button
              type="button"
              onClick={() => {
                deleteStoryItems([storyOptionsItems[0]]);
                closeStoryOptions();
              }}
            >
              {storyOptionsItems.length > 1 ? "Delete latest story" : "Delete story"}
            </button>
            {storyOptionsItems.length > 1 && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  deleteStoryItems(storyOptionsItems);
                  closeStoryOptions();
                }}
              >
                Delete all stories
              </button>
            )}
            <button type="button" className="ghost" onClick={closeStoryOptions}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {storyInsightsOpen && (
        <div className="chat-story-insights-backdrop" onClick={closeStoryInsights}>
          <div className="chat-story-insights" onClick={(e) => e.stopPropagation()}>
            <div className="chat-story-insights-header">
              <strong>
                {storyInsightsTab === "engagement"
                  ? `Viewed by ${formatStoryCount(Number(activeStory?.viewCount || storyInsightsItems.length || 0))}`
                  : storyInsightsTab === "likes"
                  ? "Liked by"
                  : storyInsightsTab === "views"
                    ? "Viewed by"
                    : "Comments"}
              </strong>
              <button type="button" aria-label="Close insights" onClick={closeStoryInsights}>
                <FiX />
              </button>
            </div>
            {storyInsightsLoading && <p className="chat-story-insights-state">Loading...</p>}
            {!storyInsightsLoading && storyInsightsError && (
              <p className="chat-story-insights-state error">{storyInsightsError}</p>
            )}
            {!storyInsightsLoading && !storyInsightsError && storyInsightsItems.length === 0 && (
              <p className="chat-story-insights-state">No data yet.</p>
            )}
            {!storyInsightsLoading && !storyInsightsError && storyInsightsItems.length > 0 && (
              <div className="chat-story-insights-list">
                {storyInsightsItems.map((entry, idx) => {
                  const name = String(entry?.name || entry?.username || entry?.email || "Unknown").trim() || "Unknown";
                  const avatarRaw = String(entry?.profilePic || "").trim();
                  const avatarUrl = avatarRaw ? toApiUrl(avatarRaw) : "";
                  const timeValue =
                    storyInsightsTab === "engagement"
                      ? (entry?.likedAt || entry?.viewedAt || entry?.createdAt || entry?.time || null)
                      : (entry?.viewedAt || entry?.commentedAt || null);
                  const entryKey = `${entry?.userId || "u"}-${entry?.email || "x"}-${idx}`;
                  return (
                    <div key={entryKey} className="chat-story-insights-item">
                      <div className="chat-story-insights-avatar" aria-hidden="true">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={name} />
                        ) : (
                          <span>{name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="chat-story-insights-meta">
                        <strong>{name}</strong>
                        {storyInsightsTab === "comments" && entry?.text && <p>{String(entry.text)}</p>}
                        {storyInsightsTab === "engagement" && (
                          <p className="chat-story-insights-engagement">
                            {entry?.liked ? (
                              <>
                                <FiHeart aria-hidden="true" /> Liked
                              </>
                            ) : (
                              "Viewed"
                            )}
                          </p>
                        )}
                        {timeValue && <small>{formatMessageTime(timeValue)}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

