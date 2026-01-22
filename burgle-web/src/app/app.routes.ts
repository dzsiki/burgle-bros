
import {CanDeactivateFn, Routes} from '@angular/router';
import { LobbyComponent } from './lobby/lobby';
import { RoomPageComponent } from './room-page/room-page';

export const leaveRoomGuard: CanDeactivateFn<RoomPageComponent> =
  async (component) => {
    // itt nincs navigálás, csak cleanup
    return component.cleanupOnExit();
  };

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: '', redirectTo: '/lobby', pathMatch: 'full' },
  {
    path: 'room/:id',
    component: RoomPageComponent,
    canDeactivate: [leaveRoomGuard],
  },
];
