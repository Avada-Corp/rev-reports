import { Module, forwardRef } from "@nestjs/common";
import { CommissionCheckService } from "./commission-check.service";
import { DbModule } from "src/db/db.module";
import { MarketsModule } from "src/markets/markets.module";

@Module({
  imports: [DbModule, forwardRef(() => MarketsModule)],
  providers: [CommissionCheckService],
  exports: [CommissionCheckService]
})
export class CommissionCheckModule {}
