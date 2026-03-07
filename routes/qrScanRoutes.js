const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/pg/:id", (req, res) => {

const id = req.params.id;

const query = `
SELECT
pg_name,
rent_amount,
available_rooms,
single_sharing,
double_sharing,
triple_sharing,
four_sharing,
contact_phone
FROM pg
WHERE id = ?
AND status='active'
AND is_deleted=0
`;

db.query(query,[id],(err,result)=>{

if(err) return res.status(500).json(err);

if(!result.length)
return res.status(404).json({message:"PG not found"});

res.json(result[0]);

});

});

module.exports = router;