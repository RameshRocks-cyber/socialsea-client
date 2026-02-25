import api from "./axios";

export const uploadAnonymousPost = async (formData) => {
  return api.post("/anonymous/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};
