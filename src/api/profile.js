import api from "./axios";

export const getUserProfile = (username) => {
  return api.get(`/api/profile/${username}`);
};

export const getUserProfileData = async (username) => {
  const res = await api.get(`/api/profile/${username}`);
  return res?.data?.user || res?.data || {};
};
