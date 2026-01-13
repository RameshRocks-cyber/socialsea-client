import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

export default function Register() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [msg, setMsg] = useState("")
  const navigate = useNavigate()

  const sendOtp = async () => {
    if (!username) {
      setMsg("Please enter mobile number or email")
      return
    }
    try {
      const res = await fetch("http://localhost:8081/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      })

      if (res.ok) {
        setOtpSent(true)
        setMsg("OTP sent successfully")
      } else {
        const text = await res.text()
        setMsg("Failed to send OTP: " + text)
      }
    } catch (e) {
      console.error(e)
      setMsg("Error sending OTP")
    }
  }

  const register = async () => {
    try {
      const res = await fetch("http://localhost:8081/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, otp })
      })

      if (res.ok) {
        setMsg("Registration success! Redirecting to login...")
        setTimeout(() => navigate("/login"), 1500)
      } else {
        const text = await res.text()
        setMsg("Registration failed: " + text)
      }
    } catch (e) {
      console.error(e)
      setMsg("Error registering")
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.logo}>SocialSea</h1>
        <h2 style={styles.subtitle}>Sign up to see photos and videos from your friends.</h2>

        <input
          onChange={e => setUsername(e.target.value)}
          placeholder="Mobile Number or Email"
          style={styles.input}
          disabled={otpSent}
        />

        {!otpSent ? (
          <button onClick={sendOtp} style={styles.button}>Send OTP</button>
        ) : (
          <>
            <input
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter OTP"
              style={styles.input}
            />
            <input
              type="password"
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              style={styles.input}
            />

            <p style={styles.terms}>
              By signing up, you agree to our Terms, Privacy Policy and Cookies Policy.
            </p>

            <button onClick={register} style={styles.button}>Sign up</button>
          </>
        )}

        {msg && <p style={styles.error}>{msg}</p>}
      </div>

      <div style={styles.box}>
        <p style={styles.loginText}>
          Have an account? <Link to="/login" style={styles.link}>Log in</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#000",
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: "10px"
  },
  box: {
    border: "1px solid #363636",
    backgroundColor: "#000",
    padding: "20px",
    width: "100%",
    maxWidth: "350px",
    marginBottom: "10px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box"
  },
  logo: {
    fontSize: "3rem",
    marginBottom: "20px",
    marginTop: "0",
    fontFamily: "cursive"
  },
  subtitle: {
    fontSize: "17px",
    fontWeight: "600",
    color: "#8e8e8e",
    marginBottom: "20px",
    lineHeight: "20px"
  },
  input: {
    width: "100%",
    padding: "9px 8px",
    marginBottom: "6px",
    backgroundColor: "#121212",
    border: "1px solid #363636",
    borderRadius: "3px",
    color: "#fff",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box"
  },
  button: {
    width: "100%",
    backgroundColor: "#0095f6",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "7px 16px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "15px",
    fontSize: "14px"
  },
  terms: {
    fontSize: "12px",
    color: "#8e8e8e",
    margin: "15px 0",
    lineHeight: "16px"
  },
  link: {
    color: "#0095f6",
    textDecoration: "none",
    fontWeight: "600"
  },
  loginText: {
    fontSize: "14px",
    margin: "15px 0"
  },
  error: {
    color: "#ed4956",
    fontSize: "14px",
    marginTop: "10px"
  }
}