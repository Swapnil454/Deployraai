import mongoose from "mongoose";

function connect(url){
    return mongoose.connect(url);
}

export default connect;