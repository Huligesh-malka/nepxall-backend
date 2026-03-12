const db = require("../database/db");

exports.submitAgreementForm = (req, res) => {

const {
user_id,
booking_id,
full_name,
father_name,
dob,
mobile,
email,
occupation,
company_name,
address,
city,
state,
pincode,
aadhaar_number,
aadhaar_last4,
pan_number,
checkin_date,
agreement_months,
rent,
deposit,
maintenance
} = req.body;

const aadhaar_front = req.files["aadhaar_front"]?.[0]?.filename;
const aadhaar_back = req.files["aadhaar_back"]?.[0]?.filename;
const pan_card = req.files["pan_card"]?.[0]?.filename;
const signature = req.files["signature"]?.[0]?.filename;

const sql = `
INSERT INTO agreements_form (
user_id,
booking_id,
full_name,
father_name,
dob,
mobile,
email,
occupation,
company_name,
address,
city,
state,
pincode,
aadhaar_number,
aadhaar_last4,
aadhaar_front,
aadhaar_back,
pan_number,
pan_card,
checkin_date,
agreement_months,
rent,
deposit,
maintenance,
signature
)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`;

const values = [
user_id,
booking_id,
full_name,
father_name,
dob,
mobile,
email,
occupation,
company_name,
address,
city,
state,
pincode,
aadhaar_number,
aadhaar_last4,
aadhaar_front,
aadhaar_back,
pan_number,
pan_card,
checkin_date,
agreement_months,
rent,
deposit,
maintenance,
signature
];

db.query(sql, values, (err, result) => {

if (err) {
console.log(err);
return res.status(500).json({ message: "Database error" });
}

res.json({
message: "Agreement form submitted successfully",
agreement_id: result.insertId
});

});

};