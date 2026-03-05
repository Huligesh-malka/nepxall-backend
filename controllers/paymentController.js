const QRCode = require("qrcode");
const db = require("../db");

const UPI_ID = "huligeshmalka-1@oksbi";
const MERCHANT_NAME = "Nepxall";

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {

try{

const { bookingId } = req.body;

if(!bookingId){
return res.status(400).json({
success:false,
message:"bookingId required"
});
}

// TODO: replace with real amount from booking
const amount = 1;

const orderId = `order_${bookingId}_${Date.now()}`;

const upiLink =
`upi://pay?pa=${UPI_ID}`+
`&pn=${encodeURIComponent(MERCHANT_NAME)}`+
`&tr=${orderId}`+
`&tn=${orderId}`+
`&am=${amount}`+
`&cu=INR`;

const qr = await QRCode.toDataURL(upiLink);

await db.query(
`INSERT INTO payments (booking_id,order_id,amount,status,created_at)
VALUES(?,?,?,'pending',NOW())`,
[bookingId,orderId,amount]
);

console.log("💰 Payment created:",orderId);

res.json({
success:true,
orderId,
upiLink,
qr
});

}catch(err){

console.error("CREATE PAYMENT ERROR:",err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// USER CONFIRM PAYMENT (AFTER PAYING)
//////////////////////////////////////////////////////
exports.confirmPayment = async (req,res)=>{

try{

const { orderId } = req.body;

if(!orderId){
return res.status(400).json({
success:false,
message:"orderId required"
});
}

const [rows] = await db.query(
`SELECT * FROM payments WHERE order_id=?`,
[orderId]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"payment not found"
});
}

await db.query(
`UPDATE payments
SET status='submitted',updated_at=NOW()
WHERE order_id=?`,
[orderId]
);

console.log("📩 Payment submitted:",orderId);

res.json({
success:true,
message:"Payment submitted for verification"
});

}catch(err){

console.error(err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// USER SUBMIT UTR
//////////////////////////////////////////////////////
exports.submitUTR = async (req,res)=>{

try{

const { orderId, utr } = req.body;

if(!orderId || !utr){
return res.status(400).json({
success:false,
message:"orderId and utr required"
});
}

await db.query(
`UPDATE payments
SET utr=?,status='submitted',updated_at=NOW()
WHERE order_id=?`,
[utr,orderId]
);

res.json({
success:true,
message:"UTR submitted"
});

}catch(err){

console.error(err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// ADMIN GET USER SUBMITTED PAYMENTS
//////////////////////////////////////////////////////
exports.getSubmittedPayments = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({success:false});
}

const [rows] = await db.query(`

SELECT
p.order_id,
p.amount,
p.utr,
p.status,
p.created_at,

u.name AS tenant_name,
u.phone,

pg.pg_name,

b.id AS booking_id

FROM payments p

JOIN bookings b ON b.id=p.booking_id
JOIN users u ON u.id=b.user_id
JOIN pgs pg ON pg.id=b.pg_id

WHERE p.status='submitted'

ORDER BY p.created_at DESC

`);

res.json({
success:true,
data:rows
});

}catch(err){

console.error(err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// ADMIN VERIFY PAYMENT
//////////////////////////////////////////////////////
exports.verifyPayment = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({
success:false
});
}

const { orderId } = req.params;

const [[payment]] = await db.query(
`SELECT booking_id FROM payments WHERE order_id=?`,
[orderId]
);

if(!payment){
return res.status(404).json({
success:false
});
}

await db.query(
`UPDATE payments
SET status='paid',updated_at=NOW()
WHERE order_id=?`,
[orderId]
);

const bookingId = payment.booking_id;

await db.query(
`UPDATE bookings
SET status='confirmed',
payment_status='paid',
owner_amount=(
COALESCE(rent_amount,0)+
COALESCE(security_deposit,0)+
COALESCE(maintenance_amount,0)
),
owner_settlement='PENDING'
WHERE id=?`,
[bookingId]
);

console.log("✅ PAYMENT VERIFIED:",orderId);

res.json({
success:true
});

}catch(err){

console.error(err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// ADMIN REJECT PAYMENT
//////////////////////////////////////////////////////
exports.rejectPayment = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({success:false});
}

const { orderId } = req.params;

await db.query(
`UPDATE payments
SET status='rejected',updated_at=NOW()
WHERE order_id=?`,
[orderId]
);

res.json({
success:true
});

}catch(err){

console.error(err);

res.status(500).json({
success:false
});

}

};

//////////////////////////////////////////////////////
// ADMIN PENDING OWNER SETTLEMENT
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({success:false});
}

const [rows] = await db.query(`

SELECT

b.id AS booking_id,
b.owner_amount,

u.name AS owner_name,

obd.account_holder_name,
obd.account_number,
obd.ifsc,
obd.bank_name,
obd.branch

FROM bookings b

JOIN users u ON u.id=b.owner_id
JOIN owner_bank_details obd ON obd.owner_id=u.id

WHERE b.status='confirmed'
AND b.owner_settlement='PENDING'

ORDER BY b.id DESC

`);

res.json({
success:true,
data:rows
});

}catch(err){

console.error(err);

res.status(500).json({success:false});

}

};

//////////////////////////////////////////////////////
// ADMIN MARK OWNER PAID
//////////////////////////////////////////////////////
exports.markAsSettled = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({success:false});
}

const { bookingId } = req.params;

await db.query(
`UPDATE bookings
SET owner_settlement='DONE',
settlement_date=NOW()
WHERE id=?`,
[bookingId]
);

res.json({
success:true,
message:"Settlement completed"
});

}catch(err){

console.error(err);

res.status(500).json({success:false});

}

};

//////////////////////////////////////////////////////
// ADMIN FINANCE SUMMARY
//////////////////////////////////////////////////////
exports.getFinanceSummary = async (req,res)=>{

try{

if(req.user.role!=="admin"){
return res.status(403).json({success:false});
}

const [[summary]] = await db.query(`

SELECT

(SELECT COALESCE(SUM(amount),0)
FROM payments
WHERE status='paid') AS total_received,

(SELECT COALESCE(SUM(owner_amount),0)
FROM bookings
WHERE owner_settlement='PENDING'
AND status='confirmed') AS pending_settlements,

(SELECT COALESCE(SUM(owner_amount),0)
FROM bookings
WHERE owner_settlement='DONE'
AND status='confirmed') AS total_settled,

(SELECT COALESCE(SUM(amount),0)
FROM payments
WHERE status='paid'
AND DATE(created_at)=CURDATE()) AS today_collection

`);

res.json({
success:true,
data:summary
});

}catch(err){

console.error(err);

res.status(500).json({success:false});

}

};

//////////////////////////////////////////////////////
// ADMIN SETTLEMENT HISTORY
//////////////////////////////////////////////////////
exports.getSettlementHistory = async (req,res)=>{

try{

const [rows] = await db.query(`

SELECT

b.id AS booking_id,
b.owner_amount,
b.settlement_date,

u.name AS owner_name

FROM bookings b

JOIN users u ON u.id=b.owner_id

WHERE b.owner_settlement='DONE'

ORDER BY b.settlement_date DESC

`);

res.json({
success:true,
data:rows
});

}catch(err){

console.error(err);

res.status(500).json({success:false});

}

};