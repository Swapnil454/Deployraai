import mongoose from "mongoose";

(async () => {
  try {
    await mongoose.connect('mongodb+srv://swapnilshelke819_db_user:nLR4KBv0KRsz7FWp@cluster0.c11gqyk.mongodb.net/AI_Agent');
    const DomainSetup = mongoose.model('DomainSetup', new mongoose.Schema({
      rootDomain: String,
      targetService: String,
      isPrimary: Boolean,
      domainRole: String,
      redirectTo: String,
      projectId: mongoose.Schema.Types.ObjectId,
      userId: mongoose.Schema.Types.ObjectId,
      status: String
    }, { strict: false }));
    
    const domain = await DomainSetup.findOne({ rootDomain: 'joinvarta.com' });
    if (!domain) return console.log("Not found");
    
    console.log("Found domain:", domain.domainRole);
    
    domain.isPrimary = true;
    domain.domainRole = "primary";
    domain.redirectTo = null;
    
    await domain.save();
    console.log("Saved successfully!");
    
    // Revert
    domain.isPrimary = false;
    domain.domainRole = "alias";
    await domain.save();
    
    process.exit(0);
  } catch (err) {
    console.error("Error saving:");
    console.error(err);
    process.exit(1);
  }
})();
