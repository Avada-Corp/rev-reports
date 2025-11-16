import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { RefPaid } from "src/markets/reports/interfaces";

export type UserResultsDocument = HydratedDocument<UserResults>;

@Schema()
export class UserResults {
  @Prop({ type: Number, required: true })
  startDate: number;

  @Prop({ type: Number, required: true })
  endDate: number;

  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: false })
  username: string | null;

  @Prop({ type: Array, required: true })
  apis: Array<{
    apiName: string;
    resultForPeriod: number;
    commission: number;
    refPaid: Array<RefPaid | null>;
    reportDelta: number;
  }>;

  @Prop({ type: Number, required: true })
  totalCommission: number;

  @Prop({ type: String, required: true })
  reportType: string;
}

export const UserResultsSchema = SchemaFactory.createForClass(UserResults);
