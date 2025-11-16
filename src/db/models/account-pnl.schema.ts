import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type AccountPnlDocument = HydratedDocument<AccountPnl>;

@Schema()
export class AccountPnl {
  @Prop({ type: Number, required: true })
  start: number;

  @Prop({ type: Number, required: true })
  to: number;

  @Prop({ type: Number, required: true })
  snapshotTime: number;

  @Prop({ type: Number, required: true })
  pnl: number;

  @Prop({ type: String, required: true })
  keyId: string;

  @Prop({ type: Number, required: true })
  pnlDaily: number;

  @Prop({ type: Number, required: true })
  totalBalance: number;

  @Prop({ type: String })
  balanceResponse: string;

  @Prop({ type: String })
  username: string;

  @Prop({ type: String })
  market: string;

  @Prop({ type: String })
  keyName: string;

  @Prop({ type: String })
  email: string;
}

export const AccountPnlSchema = SchemaFactory.createForClass(AccountPnl);

// Добавляем индексы
AccountPnlSchema.index({ to: 1 });
AccountPnlSchema.index({ to: 1, email: 1 });
AccountPnlSchema.index({ keyId: 1, to: 1 });
