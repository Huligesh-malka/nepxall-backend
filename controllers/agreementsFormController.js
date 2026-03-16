import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import imageCompression from "browser-image-compression";

const AgreementForm = () => {

  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    mobile: "",
    email: "",
    pan_number: ""
  });

  const [files, setFiles] = useState({
    aadhaar_front: null,
    aadhaar_back: null,
    pan_card: null,
    signature: null
  });

  // text change
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // compress image before upload
  const handleFileChange = async (e) => {

    const file = e.target.files[0];
    if (!file) return;

    // file size limit check
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be under 5MB");
      return;
    }

    try {

      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);

      setFiles(prev => ({
        ...prev,
        [e.target.name]: compressedFile
      }));

    } catch (err) {
      console.error("Compression Error", err);
      alert("Image compression failed");
    }
  };

  // submit form
  const handleSubmit = async (e) => {

    e.preventDefault();

    if (loading) return;

    setLoading(true);

    try {

      const data = new FormData();

      data.append("booking_id", id);

      Object.keys(formData).forEach(key => {
        data.append(key, formData[key]);
      });

      Object.keys(files).forEach(key => {
        if (files[key]) {
          data.append(key, files[key]);
        }
      });

      await api.post("/agreements-form/submit", data);

      setSubmitted(true);

    } catch (error) {

      console.error("Upload Error:", error);

      alert("Upload failed. Try smaller files.");

    } finally {

      setLoading(false);

    }
  };

  // success screen
  if (submitted) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        <h2 style={{ color: "#10b981" }}>✅ Submission Received!</h2>
        <p>Your agreement has been submitted.</p>

        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 20px",
            background: "#4f46e5",
            color: "#fff",
            border: "none",
            borderRadius: "5px"
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (

    <div style={{
      padding: "30px",
      maxWidth: "600px",
      margin: "auto",
      background: "#fff",
      borderRadius: "10px"
    }}>

      <h2>Submit Agreement (Booking #{id})</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "15px" }}>

        <input
          style={styles.input}
          placeholder="Full Name"
          name="full_name"
          onChange={handleChange}
          required
        />

        <input
          style={styles.input}
          placeholder="Mobile"
          name="mobile"
          onChange={handleChange}
          required
        />

        <input
          style={styles.input}
          placeholder="Email"
          name="email"
          onChange={handleChange}
        />

        <input
          style={styles.input}
          placeholder="PAN Number"
          name="pan_number"
          onChange={handleChange}
        />

        <div style={styles.fileBox}>
          <label>Aadhaar Front</label>
          <input
            type="file"
            name="aadhaar_front"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        <div style={styles.fileBox}>
          <label>Aadhaar Back</label>
          <input
            type="file"
            name="aadhaar_back"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        <div style={styles.fileBox}>
          <label>PAN Card</label>
          <input
            type="file"
            name="pan_card"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        <div style={styles.fileBox}>
          <label>Signature</label>
          <input
            type="file"
            name="signature"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            ...styles.btn,
            background: loading ? "#999" : "#4f46e5"
          }}
        >
          {loading ? "Uploading..." : "Submit Agreement"}
        </button>

      </form>

    </div>
  );
};

const styles = {

  input: {
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "5px"
  },

  fileBox: {
    padding: "10px",
    border: "1px dashed #ccc",
    borderRadius: "5px",
    background: "#f9f9f9"
  },

  btn: {
    padding: "15px",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    fontWeight: "bold",
    cursor: "pointer"
  }

};

export default AgreementForm;