import { PartialType } from '@nestjs/mapped-types';
import { CrearEmpresaDto } from './crear-empresa.dto';

export class ActualizarEmpresaDto extends PartialType(CrearEmpresaDto) {}
