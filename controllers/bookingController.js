import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import api from "../api/api";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* ================= BRAND COLORS ================= */
const BRAND_BLUE = "#0B5ED7";
const BRAND_GREEN = "#4CAF50";
const BRAND_RED = "#ef4444";
const BRAND_ORANGE = "#f59e0b";

/* ================= 3-DOT MENU COMPONENT ================= */
const ThreeDotMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={dotBtn}
        aria-label="More options"
      >
        <span style={dot} />
        <span style={dot} />
        <span style={dot} />
      </button>

      {open && (
        <div style={dropdownMenu}>
          {items.map((item, idx) => (
            <button
              key={idx}
              style={{
                ...dropdownItem,
                color: item.danger ? BRAND_RED : item.warn ? BRAND_ORANGE : "#111827",
                borderBottom: idx < items.length - 1 ? "1px solid #f3f4f6" : "none",
              }}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              <span style={{ marginRight: 10, fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Stay Details Component - ONLY shows Room, Payment, Deposit, Receipt
const StayDetails = ({ stay, formatDate }) => {
  return (
    <div style={detailsContainer}>
      {/* Stay Information */}
      <div style={infoGrid}>
        <div style={infoItem}>
          <label style={labelStyle}>🚪 Allotted Room</label>
          <p style={valStyle}>{stay.room_no || "Allocating..."}</p>
        </div>
        <div style={infoItem}>
          <label style={labelStyle}>👥 Sharing Type</label>
          <p style={valStyle}>{stay.room_type || "N/A"}</p>
        </div>
        <div style={{ ...infoItem, gridColumn: "span 2", marginTop: "10px" }}>
          <label style={labelStyle}>🆔 Order ID</label>
          <p
            style={{
              ...valStyle,
              fontSize: "12px",
              color: BRAND_BLUE,
              wordBreak: "break-all",
            }}
          >
            {stay.order_id || "N/A"}
          </p>
        </div>
      </div>

      <div style={priceList}>
        <p style={{ ...priceRow, color: BRAND_GREEN, fontWeight: "700" }}>
          💰 Paid On: <span>{formatDate(stay.paid_date)}</span>
        </p>
        {stay.rent_amount > 0 && (
          <p style={priceRow}>
            Monthly Rent: <span>₹{stay.rent_amount}</span>
          </p>
        )}
        {stay.maintenance_amount > 0 && (
          <p style={priceRow}>
            Maintenance: <span>₹{stay.maintenance_amount}</span>
          </p>
        )}
        {stay.deposit_amount > 0 && (
          <p
            style={{
              ...priceRow,
              borderTop: "1px dashed #eee",
              paddingTop: "10px",
              marginTop: "10px",
            }}
          >
            Security Deposit (Paid):{" "}
            <span style={{ fontWeight: "bold" }}>₹{stay.deposit_amount}</span>
          </p>
        )}
        <div style={totalBox}>
          <span>Total Paid</span>
          <span style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
            ₹{stay.total_paid}
          </span>
        </div>
      </div>
    </div>
  );
};

const UserActiveStay = () => {
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStayId, setSelectedStayId] = useState(null);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const receiptRef = useRef();
  const [selectedStay, setSelectedStay] = useState(null);

  // Load stays
  const loadStay = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setLoading(true);
      if (!user) return;

      const res = await api.get("/bookings/user/active-stay");
      const staysData = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
      setStays(staysData);
      
      if (staysData.length > 0 && !selectedStayId) {
        setSelectedStayId(staysData[0].id);
      }
    } catch (err) {
      console.error("Error loading stays:", err);
    } finally {
      if (forceRefresh) setLoading(false);
    }
  }, [user, selectedStayId]);

  useEffect(() => {
    if (user) {
      loadStay(true);
    }
  }, [user, loadStay]);

  const currentStay = stays.find(s => s.id === selectedStayId);

  const formatDate = (dateString) => {
    if (!dateString) return "Processing...";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const handleDownloadReceipt = async (stay) => {
    setSelectedStay(stay);
    setTimeout(async () => {
      try {
        const element = receiptRef.current;
        const canvas = await html2canvas(element, {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Receipt_${stay.order_id || "Booking"}.pdf`);
        setSelectedStay(null);
      } catch (error) {
        console.error("Receipt Generation Failed:", error);
      }
    }, 500);
  };

  if (authLoading) {
    return (
      <div style={mainContent}>
        <p style={{ textAlign: "center", padding: 50 }}>⏳ Loading authentication...</p>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div style={mainContent}>
        <p style={{ textAlign: "center", padding: 50 }}>⏳ Syncing your stays...</p>
      </div>
    );
  }

  if (stays.length === 0) {
    return (
      <div style={mainContent}>
        <div style={emptyBox}>
          <h3 style={{ color: "#4b5563" }}>No Active Stays Found</h3>
          <p style={{ color: "#9ca3af", marginBottom: 20 }}>
            You don't have any confirmed bookings at the moment.
          </p>
          <button style={btn} onClick={() => navigate("/")}>
            Browse PGs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={mainContent}>
      {/* Stay Selection Dropdown */}
      <div style={staySelector}>
        <label style={selectorLabel}>Select Stay:</label>
        <select 
          style={selector}
          value={selectedStayId || ''}
          onChange={(e) => setSelectedStayId(Number(e.target.value))}
        >
          {stays.map((stay) => (
            <option key={stay.id} value={stay.id}>
              {stay.pg_name} - Room {stay.room_no}
            </option>
          ))}
        </select>
      </div>

      {currentStay && (
        <div style={contentCard}>
          {/* Header with PG name and 3-dot menu */}
          <div style={cardHeader}>
            <div>
              <h2 style={pgName}>{currentStay.pg_name}</h2>
              <p style={roomInfo}>
                Room {currentStay.room_no} • {currentStay.room_type} Sharing
              </p>
            </div>
            <ThreeDotMenu
              items={[
                {
                  icon: "📜",
                  label: "Booking History",
                  onClick: () => navigate("/user/bookings"),
                },
                {
                  icon: "💳",
                  label: "Pay Rent",
                  onClick: () => navigate("/payment"),
                },
                {
                  icon: "📥",
                  label: "Download Receipt",
                  onClick: () => handleDownloadReceipt(currentStay),
                },
              ]}
            />
          </div>

          {/* Content Area - ONLY Stay Details (Room, Payment, Deposit, Receipt) */}
          <div style={viewContent}>
            <StayDetails 
              stay={currentStay}
              formatDate={formatDate}
            />
          </div>
        </div>
      )}

      {/* Hidden Receipt for PDF */}
      {selectedStay && (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <div ref={receiptRef} style={modernReceiptContainer}>
            <div style={{ ...receiptHeader, borderBottom: `4px solid ${BRAND_BLUE}` }}>
              <div>
                <h1 style={logoText}>
                  <span style={{ color: BRAND_BLUE }}>NEP</span>
                  <span style={{ color: BRAND_GREEN }}>XALL</span>
                </h1>
                <p style={tagline}>Next Places for Living</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <h2 style={receiptTitle}>RENT RECEIPT</h2>
                <p style={{ ...orderIdText, color: BRAND_BLUE }}>
                  Order ID: {selectedStay.order_id || "N/A"}
                </p>
                <p style={dateText}>
                  Date: {formatDate(selectedStay.paid_date || new Date())}
                </p>
              </div>
            </div>

            <div style={mainReceiptBody}>
              <div style={{ flex: 1 }}>
                <div style={sectionBlock}>
                  <label style={receiptLabel}>👤 ISSUED TO</label>
                  <p style={receiptValue}>
                    {user?.displayName || "Valued Tenant"}
                  </p>
                  <p style={receiptSubValue}>
                    Mob: {user?.phoneNumber || "Registered User"}
                  </p>
                </div>
                <div style={sectionBlock}>
                  <label style={receiptLabel}>🏠 PROPERTY DETAILS</label>
                  <p style={receiptValue}>{selectedStay.pg_name}</p>
                  <p style={receiptSubValue}>
                    {selectedStay.room_type} Sharing{" "}
                    {selectedStay.room_no ? `| Room: ${selectedStay.room_no}` : ""}
                  </p>
                </div>
              </div>
              <div style={paymentStatusBox}>
                <div style={statusCircle}>✅</div>
                <h3 style={{ ...statusText, color: BRAND_GREEN }}>VERIFIED</h3>
                <p style={dateText}>Payment Mode: Online</p>
                <div style={amountDisplay}>₹{selectedStay.total_paid}</div>
              </div>
            </div>

            <div style={tableContainer}>
              <div style={{ ...tableHeader, background: BRAND_BLUE }}>
                <span>📊 PAYMENT BREAKDOWN</span>
                <span>Amount</span>
              </div>
              {selectedStay.rent_amount > 0 && (
                <div style={tableRow}>
                  <span>Monthly Room Rent ({selectedStay.room_type})</span>
                  <span>₹{selectedStay.rent_amount}</span>
                </div>
              )}
              {selectedStay.maintenance_amount > 0 && (
                <div style={tableRow}>
                  <span>Maintenance Charges</span>
                  <span>₹{selectedStay.maintenance_amount}</span>
                </div>
              )}
              <div
                style={{
                  ...tableRow,
                  borderBottom: `2px solid ${BRAND_BLUE}`,
                  fontWeight: "bold",
                  background: "#f8fafc",
                }}
              >
                <span>Total Amount Received</span>
                <span>₹{selectedStay.total_paid}</span>
              </div>
            </div>

            {selectedStay.deposit_amount > 0 && (
              <div
                style={{
                  ...sectionBlock,
                  marginTop: "30px",
                  padding: "20px",
                  background: "#f0f4f8",
                  borderRadius: "10px",
                }}
              >
                <label style={receiptLabel}>💳 SECURITY DEPOSIT (ONE-TIME)</label>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={receiptValue}>₹{selectedStay.deposit_amount}</span>
                  <span style={{ color: BRAND_GREEN, fontWeight: "bold" }}>
                    Paid (Refundable)
                  </span>
                </div>
              </div>
            )}

            <div style={footerNote}>
              <div
                style={{ textAlign: "left", marginBottom: "20px", color: "#4b5563" }}
              >
                <p>
                  ✔ Verified Transaction:{" "}
                  <strong>{selectedStay.order_id || "N/A"}</strong>
                </p>
                <p>
                  ✔ This is a digital proof of stay generated by Nepxall.
                </p>
              </div>
              <p
                style={{
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "20px",
                }}
              >
                * System-generated receipt. No signature required.
              </p>
              <p
                style={{ fontWeight: "bold", marginTop: 5, color: BRAND_BLUE }}
              >
                THANK YOU FOR STAYING WITH US!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===== STYLES ===== */
const mainContent = {
  maxWidth: 900,
  margin: "40px auto",
  padding: "0 20px",
  fontFamily: "Inter, sans-serif",
};

const staySelector = {
  marginBottom: 20,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const selectorLabel = {
  fontSize: 14,
  fontWeight: 500,
  color: "#374151",
};

const selector = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  backgroundColor: "#fff",
  cursor: "pointer",
};

const contentCard = {
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  overflow: "hidden",
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "24px 30px",
  borderBottom: "1px solid #f0f0f0",
  background: "#fff",
};

const pgName = {
  fontSize: 20,
  fontWeight: 700,
  color: "#111827",
  margin: 0,
};

const roomInfo = {
  fontSize: 14,
  color: "#6b7280",
  margin: "5px 0 0 0",
};

const viewContent = {
  padding: "30px",
};

const infoGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginBottom: 20,
};

const labelStyle = {
  fontSize: "11px",
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: "600",
};

const valStyle = {
  margin: "2px 0 0 0",
  fontWeight: "700",
  fontSize: "15px",
  color: "#111827",
};

const priceList = {
  marginBottom: 20,
  background: "#f9fafb",
  padding: "15px",
  borderRadius: "12px",
};

const priceRow = {
  display: "flex",
  justifyContent: "space-between",
  color: "#4b5563",
  margin: "10px 0",
  fontSize: "14px",
};

const totalBox = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 15,
  padding: "15px",
  background: "#f0fdf4",
  borderRadius: "8px",
  color: "#166534",
};

const infoItem = { display: "flex", flexDirection: "column" };
const btn = {
  flex: 1,
  minWidth: "100px",
  padding: "12px",
  background: BRAND_BLUE,
  color: "#fff",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: "600",
  fontSize: "13px",
};

const emptyBox = {
  textAlign: "center",
  padding: 60,
  background: "#fff",
  borderRadius: 16,
  border: "2px dashed #e5e7eb",
};

const detailsContainer = {
  animation: "fadeIn 0.3s ease",
};

// 3-dot button styles
const dotBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "6px 10px",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  alignItems: "center",
  transition: "background 0.15s",
};

const dot = {
  display: "block",
  width: "4px",
  height: "4px",
  borderRadius: "50%",
  background: "#6b7280",
};

const dropdownMenu = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  zIndex: 999,
  minWidth: "190px",
  overflow: "hidden",
};

const dropdownItem = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "12px 16px",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "500",
  textAlign: "left",
  fontFamily: "Inter, sans-serif",
  transition: "background 0.12s",
};

// Receipt styles
const modernReceiptContainer = {
  width: "210mm",
  minHeight: "297mm",
  padding: "60px",
  background: "#ffffff",
  color: "#111827",
  fontFamily: "Helvetica, Arial, sans-serif",
};

const receiptHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  paddingBottom: "20px",
  marginBottom: "30px",
};

const logoText = {
  margin: 0,
  fontSize: "36px",
  fontWeight: "900",
  letterSpacing: "-1px",
};

const tagline = { margin: 0, fontSize: "12px", color: "#6b7280" };
const receiptTitle = { margin: 0, fontSize: "22px", color: "#111827" };
const orderIdText = { margin: 0, fontSize: "14px", fontWeight: "bold" };
const mainReceiptBody = {
  display: "flex",
  gap: "30px",
  marginBottom: "40px",
};
const sectionBlock = { marginBottom: "20px" };
const receiptLabel = {
  fontSize: "11px",
  color: "#9ca3af",
  fontWeight: "bold",
  letterSpacing: "1px",
  display: "block",
  marginBottom: "5px",
};
const receiptValue = {
  fontSize: "16px",
  fontWeight: "bold",
  margin: 0,
  color: "#111827",
};
const receiptSubValue = { fontSize: "13px", color: "#4b5563", margin: "2px 0" };
const paymentStatusBox = {
  width: "200px",
  background: "#f8fafc",
  borderRadius: "15px",
  border: "1px solid #e2e8f0",
  padding: "20px",
  textAlign: "center",
};
const statusCircle = { fontSize: "30px", marginBottom: "5px" };
const statusText = { margin: 0, fontSize: "18px", fontWeight: "bold" };
const dateText = { fontSize: "12px", color: "#6b7280", margin: "5px 0" };
const amountDisplay = {
  fontSize: "24px",
  fontWeight: "900",
  color: "#111827",
  marginTop: "10px",
};
const tableContainer = { marginTop: "10px" };
const tableHeader = {
  display: "flex",
  justifyContent: "space-between",
  padding: "12px",
  color: "#fff",
  borderRadius: "8px 8px 0 0",
  fontWeight: "bold",
};
const tableRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "15px 12px",
  borderBottom: "1px solid #e5e7eb",
};
const footerNote = {
  marginTop: "50px",
  textAlign: "center",
  color: "#9ca3af",
  fontSize: "12px",
};

export default UserActiveStay;