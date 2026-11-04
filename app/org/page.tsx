import { redirect } from "next/navigation";

// /org on its own isn't a workspace. "/" already routes a signed-in user into
// their active org (and a signed-out one to the landing page).
export default function OrgIndex() {
  redirect("/");
}
