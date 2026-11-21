declare namespace App {
  interface Locals {
    // A message for the page rendered in response to a script submission.
    flash?: string | null;
    // The page a script submission ended on.
    location?: string;
  }
}
