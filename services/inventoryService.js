exports.allocateUnit = async (booking) => {

  if (booking.property_type === "PG") {
    return "BED-12";
  }

  if (booking.property_type === "CO_LIVING") {
    return "ROOM-4";
  }

  if (booking.property_type === "TO_LET") {
    return "FULL_PROPERTY_LOCKED";
  }

};