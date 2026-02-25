import api from "./axios";

export const getUserProfile = (username) => {
  return api.get(`/profile/${username}`);
};