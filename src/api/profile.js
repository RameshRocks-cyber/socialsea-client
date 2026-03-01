import api from "./axios";

export const getUserProfile = (username) => {
  return api.get(`/api/profile/${username}`);
};