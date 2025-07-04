const mongoose = require('mongoose');
const GroupMembership = require('../groups/groupMembership');

// Migration script to update groupmemberships role from "admin" to "groupAdmin"
async function migrateGroupMembershipRoles() {
  try {
    console.log('Starting migration: Updating groupmemberships role from "admin" to "groupAdmin"...');
    
    // Find all groupmemberships with role "admin"
    const adminMemberships = await GroupMembership.find({ role: 'admin' });
    
    console.log(`Found ${adminMemberships.length} groupmemberships with role "admin"`);
    
    if (adminMemberships.length === 0) {
      console.log('No records to update. Migration completed.');
      return;
    }
    
    // Update all records from "admin" to "groupAdmin"
    const result = await GroupMembership.updateMany(
      { role: 'admin' },
      { $set: { role: 'groupAdmin' } }
    );
    
    console.log(`Migration completed successfully!`);
    console.log(`Updated ${result.modifiedCount} records from "admin" to "groupAdmin"`);
    
    // Verify the update
    const remainingAdminMemberships = await GroupMembership.find({ role: 'admin' });
    const newGroupAdminMemberships = await GroupMembership.find({ role: 'groupAdmin' });
    
    console.log(`Verification:`);
    console.log(`- Remaining "admin" roles in groupmemberships: ${remainingAdminMemberships.length}`);
    console.log(`- Total "groupAdmin" roles in groupmemberships: ${newGroupAdminMemberships.length}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  // Connect to MongoDB (you'll need to update the connection string)
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parenting-community', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    return migrateGroupMembershipRoles();
  })
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = migrateGroupMembershipRoles;

