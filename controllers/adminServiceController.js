const db = require("../db");

/* GET ALL SERVICE BOOKINGS */
exports.getAllServiceBookings = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT 
        sb.*,
        u.name as tenant_name,
        v.name as vendor_name
      FROM service_bookings sb
      JOIN users u ON u.id = sb.user_id
      LEFT JOIN users v ON v.id = sb.assigned_vendor_id
      ORDER BY sb.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message:"Failed to load services"});
  }
};


/* GET ALL VENDORS */
exports.getVendors = async (req,res)=>{
  try{

    const [vendors] = await db.query(`
      SELECT id,name
      FROM users
      WHERE role='vendor'
    `);

    res.json({
      success:true,
      vendors
    });

  }catch(err){
    res.status(500).json({success:false});
  }
};


/* ASSIGN VENDOR */
exports.assignVendor = async (req,res)=>{
  try{

    const { serviceId, vendorId } = req.body;

    await db.query(`
      UPDATE service_bookings
      SET assigned_vendor_id = ?, vendor_status='approved'
      WHERE id = ?
    `,[vendorId, serviceId]);

    res.json({
      success:true,
      message:"Vendor assigned successfully"
    });

  }catch(err){
    res.status(500).json({success:false});
  }
};