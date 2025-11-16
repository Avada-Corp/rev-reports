import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type AccountDocument = HydratedDocument<Account>;

@Schema()
export class Account {
  @Prop({ type: Number, required: true })
  start: number;

  @Prop({ type: Number, required: true })
  to: number;

  @Prop({ type: Number, required: true })
  snapshotTime: number;

  @Prop({ type: Object, required: true })
  transfers: any | null;

  @Prop({ type: Boolean })
  notForTransferCount: boolean;

  @Prop({ type: Number, required: true })
  totalBalance: number;

  @Prop({ type: Number, required: true })
  pnl: number;

  @Prop({ type: String, required: true })
  keyId: string;

  @Prop({ type: String, required: true })
  report: string;

  @Prop({ type: Number, required: true })
  pnlDaily: number | null;

  @Prop({ type: String })
  balanceResponse: string;

  @Prop({ type: String })
  username: string;

  @Prop({ type: String })
  market: string;

  @Prop({ type: String })
  keyName: string;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

// Добавляем индексы
AccountSchema.index({ to: 1 });
AccountSchema.index({ keyId: 1, to: 1 });
