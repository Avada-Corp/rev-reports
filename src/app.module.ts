import { Module } from "@nestjs/common";
import { MarketsModule } from "./markets/markets.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DbService } from "./db/db.service";
import { DbModule } from "./db/db.module";
import { MongooseModule } from "@nestjs/mongoose";
import { envToBoolean } from "./markets/helpers";
import { CheckerModule } from "./checker/checker.module";
import { ReportsModule } from "./reports/reports.module";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        console.info('REPORTS converted ("IS_PRODUCTION"): ', envToBoolean(config.get("IS_PRODUCTION")));
        console.log('config.get("REV_URL"): ', config.get("REV_URL"));
        return {
          uri: config.get("REV_URL"),
          useNewUrlParser: true,
          useUnifiedTopology: true
        };
      },
      inject: [ConfigService]
    }),
    MarketsModule,
    ConfigModule.forRoot({
      isGlobal: true
    }),
    ScheduleModule.forRoot(),
    DbModule,
    CheckerModule,
    ReportsModule
  ],
  providers: [DbService]
})
export class AppModule {}
