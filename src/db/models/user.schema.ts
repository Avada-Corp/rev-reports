import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

export interface ApiObject {
  key: string;
  secret: string;
  name: string;
  market: string;
  rev_id: string;
  _id: string;
  botIds: string[];
  isCreating: boolean;
  expirationDate: number;
}

export interface PrivateCommission {
  percent: number;
  absolute: number;
}

@Schema()
export class User {
  @Prop({ required: true })
  email: string;

  @Prop({ type: Array, default: [] })
  api: ApiObject[];

  @Prop({ default: false })
  isAllBotsCreated: boolean;

  @Prop({ default: false })
  isSendRequestForStopBots: boolean;

  @Prop({ type: Object, default: null })
  privateCommission: PrivateCommission;

  @Prop({ default: 0 })
  refPercent: number;

  @Prop({ type: Object, default: null })
  refLevels: any;

  @Prop()
  leadId: number;

  @Prop()
  crmStatus: string;

  @Prop({ enum: ["weekly", "monthly"] })
  commissionType: "weekly" | "monthly";
}

export const UserSchema = SchemaFactory.createForClass(User);
