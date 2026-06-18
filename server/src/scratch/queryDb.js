import mongoose from "mongoose";

(async () => {
  try {
    await mongoose.connect('mongodb+srv://swapnilshelke819_db_user:nLR4KBv0KRsz7FWp@cluster0.c11gqyk.mongodb.net/AI_Agent');
    const DomainSetup = mongoose.model('DomainSetup', new mongoose.Schema({}, { strict: false }));
    const domains = await DomainSetup.find({ rootDomain: 'joinvarta.com' });
    console.log(JSON.stringify(domains, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
