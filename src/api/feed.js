import api from "./axios";

export const getFeed = () => {
  return api.get("/feed");
};

export const getAnonymousFeed = () => {
  return api.get("/feed/anonymous");
};