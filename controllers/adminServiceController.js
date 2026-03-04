const db = require("../db");

exports.getAllServiceBookings = async (req,res)=>{
  try{

    const [rows] = await db.query(`
      SELECT 
      sb.id,
      sb.service_type,
      sb.amount,
      u.name AS tenant_name
      FROM service_bookings sb
      JOIN users u ON u.id = sb.user_id
      ORDER BY sb.created_at DESC
    `);

    res.json({
      success:true,
      data:rows
    });

  }catch(err){
    res.status(500).json({success:false});
  }
};


exports.getVendors = async(req,res)=>{
  try{

    const [rows] = await db.query(`
      SELECT id,name
      FROM users
      WHERE role='vendor'
    `);

    res.json({
      success:true,
      vendors:rows
    });

  }catch(err){
    res.status(500).json({success:false});
  }
};


exports.assignVendor = async(req,res)=>{
  try{

    const {serviceId,vendorId} = req.body;

    await db.query(`
      UPDATE service_bookings
      SET assigned_vendor_id=?, vendor_status='approved'
      WHERE id=?
    `,[vendorId,serviceId]);

    res.json({success:true});

  }catch(err){
    res.status(500).json({success:false});
  }
};