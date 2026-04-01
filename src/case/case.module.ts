import { Module } from '@nestjs/common';
import { CaseController } from './case.controller';
import { CaseScenarioController } from './case-scenario.controller';
import { CaseScenarioService } from './case-scenario.service';
import { CaseService } from './case.service';

@Module({
  controllers: [CaseController, CaseScenarioController],
  providers: [CaseService, CaseScenarioService],
})
export class CaseModule {}
