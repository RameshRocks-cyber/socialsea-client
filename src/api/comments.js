import api from "./axios";

export const getPostComments = async (postId) => {
  const res = await api.get(`/api/comments/${postId}`);
  return Array.isArray(res.data) ? res.data : [];
};
