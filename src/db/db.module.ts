import { Module } from "@nestjs/common";
import { DbService } from "./db.service";
import { MongooseModule } from "@nestjs/mongoose";
import { Account, AccountSchema } from "./models/account.schema";
import { UserSchema } from "./models/user.schema";
import { AccountPnlSchema } from "./models/account-pnl.schema";
import { UserResultsSchema } from "./models/user-results.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "History", schema: AccountSchema }]),
    MongooseModule.forFeature([{ name: "usersInfo", schema: UserSchema }]),
    MongooseModule.forFeature([{ name: "PnlHistory", schema: AccountPnlSchema }]),
    MongooseModule.forFeature([{ name: "UserResults", schema: UserResultsSchema }])
  ],
  providers: [DbService],
  exports: [MongooseModule, DbService]
})
export class DbModule {}
