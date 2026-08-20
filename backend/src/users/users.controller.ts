import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

class SetRolesDto {
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @CheckAbility('read', 'User')
  list(): Promise<UserResponseDto[]> {
    return this.users.list();
  }

  @Post()
  @CheckAbility('create', 'User')
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.users.create(dto);
  }

  @Patch(':id/roles')
  @CheckAbility('update', 'User')
  setRoles(@Param('id') id: string, @Body() dto: SetRolesDto): Promise<UserResponseDto> {
    return this.users.setRoles(id, dto.roles);
  }
}
