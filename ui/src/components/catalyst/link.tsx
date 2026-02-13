import * as Headless from '@headlessui/react';
import NextLink from 'next/link';
import React, { forwardRef } from 'react';

export const Link = forwardRef(function Link(
  props: React.ComponentPropsWithoutRef<typeof NextLink>,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <Headless.DataInteractive>
      <NextLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
