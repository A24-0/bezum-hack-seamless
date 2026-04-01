import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { ScenarioParamDto } from './dto/scenario-param.dto';
import { CaseScenarioService } from './case-scenario.service';

@ApiTags('case-scenarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('case/scenario')
export class CaseScenarioController {
  constructor(private readonly caseScenarioService: CaseScenarioService) {}

  @ApiOperation({ summary: 'Run demo scenario (admin only)' })
  @Post(':type')
  run(@Param() params: ScenarioParamDto) {
    return this.caseScenarioService.run(params.type);
  }
}
