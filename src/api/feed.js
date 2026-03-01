import api from "./axios";

export const getFeed = () => {
  return api.get("/api/feed");
};

export const getAnonymousFeed = () => {
  return api.get("/api/feed/anonymous");
};