import api from "./axios";

export const sendOtp = (email) => {
  return api.post("/api/auth/send-otp", { email });
};

export const verifyOtp = (email, otp) => {
  return api.post("/api/auth/verify-otp", { email, otp });
};

export function getRole() {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch (e) {
    return null;
  }
}